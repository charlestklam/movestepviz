import os
from pathlib import Path
from typing import List, Dict, Union, Optional
import json
from movestepviz.models import Label, LabelSet

# Color families by Move index: Move 1 = Green, Move 2 = Amber/Orange, Move 3 = Blue, Move 4 = Purple, Move 5 = Pink/Rose, Move 6 = Crimson/Red
MOVE_COLOR_FAMILIES = [
    # Move 1: Green family (light to dark)
    ['#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#14532d'],
    # Move 2: Red family (light to dark)
    ['#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d'],
    # Move 3: Blue family (light to dark)
    ['#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e3a8a'],
    # Move 4: Yellow / Amber family (light to dark)
    ['#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#713f12'],
    # Move 5: Purple / Violet family (light to dark)
    ['#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce', '#581c87'],
    # Move 6: Orange family (light to dark)
    ['#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#7c2d12'],
    # Move 7: Teal / Cyan family (light to dark)
    ['#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488', '#0f766e', '#115e59'],
]

OTHER_COLORS = {
    'HEADING': '#000000',  # Black
    'H': '#000000',
    'OTHER': '#9ca3af',    # Gray
    'O': '#9ca3af',
}

def generate_step_shades(family_index: int, num_steps: int) -> List[str]:
    """Generate num_steps distinct shades within a move's color family."""
    family = MOVE_COLOR_FAMILIES[family_index % len(MOVE_COLOR_FAMILIES)]
    if num_steps <= 1:
        return [family[len(family) // 2]]
    
    # Pick evenly spaced indices across family array
    indices = [int(round(i * (len(family) - 1) / max(1, num_steps - 1))) for i in range(num_steps)]
    return [family[idx] for idx in indices]


def apply_hierarchical_colors(label_sets: List[LabelSet]) -> List[LabelSet]:
    """Assign Green > Red > Blue color family shades to label sets based on Move."""
    move_idx = 0
    updated_sets: List[LabelSet] = []

    for lset in label_sets:
        lset_id_lower = lset.id.lower()
        if 'other' in lset_id_lower or lset_id_lower == 'etc':
            # Assign yellow/gray for Other sets
            new_labels = []
            for lbl in lset.labels:
                lbl_key = lbl.id.upper()
                c = OTHER_COLORS.get(lbl_key, '#9ca3af')
                new_labels.append(Label(id=lbl.id, name=lbl.name, color=c))
            updated_sets.append(LabelSet(id=lset.id, name=lset.name, multiLabel=lset.multiLabel, labels=new_labels))
        else:
            shades = generate_step_shades(move_idx, len(lset.labels))
            new_labels = []
            for idx, lbl in enumerate(lset.labels):
                new_labels.append(Label(id=lbl.id, name=lbl.name, color=shades[idx]))
            updated_sets.append(LabelSet(id=lset.id, name=lset.name, multiLabel=lset.multiLabel, labels=new_labels))
            move_idx += 1

    return updated_sets


def load_preset_schemes() -> Dict[str, List[LabelSet]]:
    data_file = Path(__file__).parent / "data" / "moves_steps.json"
    if not data_file.exists():
        return {}
    
    with open(data_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    schemes = {}
    for scheme_data in data:
        source_key = scheme_data["source"]
        section = scheme_data.get("section", "")
        
        if source_key == "Yang_Allison2003":
            base_key = f"Yang_Allison2003_{section}"
        else:
            base_key = source_key
            
        label_sets = []
        for move in scheme_data.get("moves", []):
            labels = []
            for step in move.get("steps", []):
                step_name = step.get('step_title', '')
                
                # Format name to match original (e.g. M1-S1: Title)
                if step_name.startswith('Step') or step_name.startswith('M'):
                    name_str = step_name
                else:
                    if source_key == "Swales2004":
                        name_str = f"Step {step.get('step_number', '')}: {step_name}"
                    else:
                        name_str = f"{step['step_id']}: {step_name}"
                        
                labels.append(Label(
                    id=step["step_id"],
                    name=name_str,
                    color=""
                ))
            label_sets.append(LabelSet(
                id=move["move_id"].lower(),
                name=f"Move {move['move_number']}: {move['move_title']}",
                multiLabel=False,
                labels=labels
            ))
            
        # Append "Other" to all schemes for consistency with previous hardcoded behavior
        label_sets.append(LabelSet(
            id='other',
            name='Other',
            multiLabel=False,
            labels=[
                Label(id='HEADING', name='Section heading', color='#ffff00'),
                Label(id='OTHER', name='Others/ Metadata', color='#9ca3af'),
            ]
        ))
            
        colored_sets = apply_hierarchical_colors(label_sets)
        schemes[base_key] = colored_sets
                
    return schemes

PRESET_SCHEMES: Dict[str, List[LabelSet]] = load_preset_schemes()
DEFAULT_LABEL_SETS = PRESET_SCHEMES.get('Cotos_etal2017', [])

def load_custom_scheme(file_path_or_content: Union[str, Path]) -> List[LabelSet]:
    """
    Parse a custom scheme formatted as `label;move;step` lines into a list of LabelSet objects.
    Format example:
      M1-S1;Move 1: Background;Step 1: Literature review
      M1-S2;Move 1: Background;Step 2: Context
    """
    if isinstance(file_path_or_content, Path) or (isinstance(file_path_or_content, str) and os.path.exists(file_path_or_content)):
        with open(file_path_or_content, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    else:
        lines = str(file_path_or_content).splitlines()

    moves_map: Dict[str, List[Label]] = {}
    move_names: Dict[str, str] = {}

    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or line.lower().startswith('label;move;step'):
            continue
        
        parts = [p.strip() for p in line.split(';')]
        if len(parts) >= 3:
            label_id, move_name, step_name = parts[0], parts[1], parts[2]
        elif len(parts) == 2:
            label_id, move_name, step_name = parts[0], parts[1], parts[0]
        else:
            continue

        move_id = move_name.lower().replace(' ', '_')
        if move_id not in moves_map:
            moves_map[move_id] = []
            move_names[move_id] = move_name

        moves_map[move_id].append(Label(
            id=label_id,
            name=f"{label_id}: {step_name}",
            color=''
        ))

    label_sets: List[LabelSet] = []
    for move_id, labels in moves_map.items():
        label_sets.append(LabelSet(
            id=move_id,
            name=move_names[move_id],
            multiLabel=False,
            labels=labels
        ))

    return apply_hierarchical_colors(label_sets)
