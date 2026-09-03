import os
import re
import sys
from pathlib import Path
from typing import Union, List, Dict, Any, Optional, Tuple, Sequence

from movestepviz.config import PRESET_SCHEMES, DEFAULT_LABEL_SETS, load_custom_scheme, apply_hierarchical_colors
from movestepviz.models import LabelSet, Label


def _ensure_matplotlib():
    """Safely import matplotlib with a working backend."""
    try:
        import matplotlib
        # If in headless / non-interactive or Tk is broken, fall back to Agg
        if "matplotlib.pyplot" not in sys.modules:
            backend = matplotlib.get_backend().lower()
            if "tk" in backend:
                try:
                    import tkinter
                    t = tkinter.Tk()
                    t.destroy()
                except Exception:
                    matplotlib.use("Agg")
            elif backend not in ["agg", "module://matplotlib_inline.backend_inline", "inline"]:
                try:
                    pass
                except Exception:
                    matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import matplotlib.patches as mpatches
        import matplotlib.lines as mlines
        return matplotlib, plt, mpatches, mlines
    except ImportError:
        raise ImportError("matplotlib is required for visualization. Run `pip install matplotlib`.")


def get_contrast_text_color(hex_color: str) -> str:
    """Return #000000 for light backgrounds and #ffffff for dark backgrounds based on relative luminance."""
    if not hex_color or not str(hex_color).startswith("#"):
        return "#ffffff"
    try:
        h = hex_color.lstrip("#")
        if len(h) == 6:
            r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            return "#000000" if lum > 165 else "#ffffff"
    except Exception:
        pass
    return "#ffffff"


def format_label_text(label_id: str, mode: str = "number-letter") -> str:
    """
    Format a label ID according to the selected labelling scheme:
    - 'number-letter': e.g. 'M1-S1' -> '1a', 'M1-S2' -> '1b', 'M2-S1B' -> '2b', 'M1-S0' -> '1', 'HEADING' -> 'H', 'OTHER' -> 'O'
    - 'step-only': e.g. 'M1-S1' -> 'S1', 'M2-S1B' -> 'S1B', 'HEADING' -> 'H', 'OTHER' -> 'O'
    - 'simplified': e.g. 'M1-S1' -> '1.1', 'M2-S1B' -> '2.1B', 'M1-S0' -> '1.0'
    - 'original': e.g. 'M1-S1' -> 'M1-S1'
    """
    if not label_id:
        return ""

    label_str = str(label_id).strip()
    lbl_upper = label_str.upper()

    if lbl_upper in ["HEADING", "HEAD", "H"]:
        return "H"
    if lbl_upper in ["OTHER", "OTHERS", "O"]:
        return "O"
    if lbl_upper in ["TITLE", "T"]:
        return "T"

    norm_mode = mode.lower().replace("_", "-")

    # Match Move-Step with optional sub-letter (e.g. M1-S1, M2-S1B, M1_S2, Move1 Step1, M1S1A)
    match = re.search(r"[Mm](\d+)[-_\s]*[Ss](\d+)([A-Za-z]*)", label_str)
    if match:
        move_num = match.group(1)
        step_num = match.group(2)
        sub_letter = match.group(3).upper()

        if norm_mode == "step-only":
            return f"S{step_num}{sub_letter}"
        elif norm_mode == "simplified":
            return f"{move_num}.{step_num}{sub_letter}"
        elif norm_mode == "number-letter":
            step_idx = int(step_num)
            if step_idx == 0:
                return f"{move_num}" if not sub_letter else f"{move_num}{sub_letter.lower()}"
            letter = chr(96 + step_idx) if 1 <= step_idx <= 26 else str(step_idx)
            if sub_letter:
                letter = sub_letter.lower()
            return f"{move_num}{letter}"
        elif norm_mode == "original":
            return f"M{move_num}-S{step_num}{sub_letter}"

    # Match Number-Letter notation (e.g. 1a, 2b, 1A, 2B, 3d)
    nl_match = re.search(r"^(\d+)([A-Za-z]+)$", label_str)
    if nl_match:
        move_num = nl_match.group(1)
        letter_str = nl_match.group(2).lower()
        step_idx = (ord(letter_str[0]) - 96) if (len(letter_str) == 1 and "a" <= letter_str <= "z") else 0
        if norm_mode == "number-letter":
            return f"{move_num}{letter_str}"
        elif norm_mode == "simplified":
            return f"{move_num}.{step_idx if step_idx > 0 else letter_str}"
        elif norm_mode == "step-only":
            return f"S{step_idx if step_idx > 0 else letter_str.upper()}"
        elif norm_mode == "original":
            return f"M{move_num}-S{step_idx if step_idx > 0 else letter_str.upper()}"

    # Match Decimal notation (e.g. 1.1, 1.2, 2.1, 2.4)
    dec_match = re.search(r"^(\d+)\.(\d+)([A-Za-z]*)$", label_str)
    if dec_match:
        move_num = dec_match.group(1)
        step_num = int(dec_match.group(2))
        sub_letter = dec_match.group(3).lower()
        letter = chr(96 + step_num) if 1 <= step_num <= 26 else str(step_num)
        effective_letter = sub_letter if sub_letter else letter
        if norm_mode == "number-letter":
            return f"{move_num}{effective_letter}"
        elif norm_mode == "simplified":
            return f"{move_num}.{step_num}{sub_letter}"
        elif norm_mode == "step-only":
            return f"S{step_num}{sub_letter.upper()}"
        elif norm_mode == "original":
            return f"M{move_num}-S{step_num}{sub_letter.upper()}"

    # Match Step only (e.g. S1, S2A, Step 1)
    s_match = re.search(r"^[Ss](\d+)([A-Za-z]*)$", label_str)
    if s_match:
        step_num = s_match.group(1)
        sub_letter = s_match.group(2).upper()
        if norm_mode == "step-only":
            return f"S{step_num}{sub_letter}"
        elif norm_mode in ["simplified", "number-letter"]:
            step_idx = int(step_num)
            letter = chr(96 + step_idx) if 1 <= step_idx <= 26 else str(step_idx)
            if sub_letter:
                letter = sub_letter.lower()
            return letter if norm_mode == "number-letter" else f"{step_num}{sub_letter}"

    # Match Move only (e.g. M1, M2, Move 1)
    m_match = re.search(r"^[Mm](\d+)$", label_str)
    if m_match:
        move_num = m_match.group(1)
        if norm_mode in ["simplified", "number-letter"]:
            return move_num
        elif norm_mode == "step-only":
            return f"M{move_num}"

    return label_str


def resolve_scheme_map(
    scheme_input: Union[str, Path, List[LabelSet]],
    custom_colors: Optional[Dict[str, str]] = None,
) -> Tuple[Dict[str, str], Dict[str, str], List[LabelSet]]:
    """
    Resolves scheme into:
    - color_map: dict mapping label_id to hex color.
    - name_map: dict mapping label_id to display name for legend.
    - label_sets: list of LabelSet objects for hierarchical legend.
    """
    label_sets: List[LabelSet] = []

    if isinstance(scheme_input, list) and all(isinstance(x, LabelSet) for x in scheme_input):
        label_sets = scheme_input
    elif isinstance(scheme_input, str):
        if scheme_input in PRESET_SCHEMES:
            label_sets = PRESET_SCHEMES[scheme_input]
        elif os.path.exists(scheme_input):
            label_sets = load_custom_scheme(scheme_input)
        else:
            key_lower = scheme_input.lower().replace("-", "_")
            found = False
            for k, v in PRESET_SCHEMES.items():
                if k.lower().replace("-", "_") == key_lower:
                    label_sets = v
                    found = True
                    break
            if not found:
                label_sets = DEFAULT_LABEL_SETS
    else:
        label_sets = DEFAULT_LABEL_SETS

    label_sets = apply_hierarchical_colors(label_sets)

    color_map: Dict[str, str] = {}
    name_map: Dict[str, str] = {}

    for m_idx, lset in enumerate(label_sets, start=1):
        for s_idx, lbl in enumerate(lset.labels, start=1):
            color = (custom_colors.get(lbl.id, lbl.color) if custom_colors else lbl.color)
            
            def add_alias(alias: str):
                if not alias:
                    return
                color_map[alias] = color
                color_map[alias.lower()] = color
                color_map[alias.upper()] = color
                clean = alias.replace("-", "").replace("_", "").upper()
                color_map[clean] = color
                name_map[alias] = f"{lset.name} - {lbl.name}"
                name_map[alias.lower()] = name_map[alias]
                name_map[alias.upper()] = name_map[alias]

            add_alias(lbl.id)

            # Number-letter aliases
            letter = chr(96 + s_idx) if 1 <= s_idx <= 26 else str(s_idx)
            add_alias(f"{m_idx}{letter}")
            add_alias(f"{m_idx}.{s_idx}")
            add_alias(f"M{m_idx}-S{s_idx}")

            s_match = re.search(r"[Ss](\d+)([A-Za-z]*)", lbl.id)
            if s_match:
                s_num = int(s_match.group(1))
                sub_l = s_match.group(2).lower()
                s_letter = sub_l if sub_l else (chr(96 + s_num) if 1 <= s_num <= 26 else str(s_num))
                add_alias(f"{m_idx}{s_letter}")
                add_alias(f"{m_idx}.{s_num}")
                add_alias(f"M{m_idx}-S{s_num}")

    return color_map, name_map, label_sets


def extract_sequences_from_data(data: Any) -> List[Dict[str, Any]]:
    """
    Extracts multi-article sequences from input data (files, DataFrames, lists, dicts).
    """
    file_stem = ""
    if isinstance(data, (str, Path)) and os.path.exists(str(data)):
        data_path = Path(str(data))
        file_stem = data_path.stem
        ext = data_path.suffix.lower()
        if ext in [".csv", ".xlsx", ".xls", ".json"]:
            try:
                import pandas as pd
            except ImportError:
                raise ImportError("pandas is required to read tabular files. Run `pip install pandas`.")

            if ext == ".csv":
                df = pd.read_csv(str(data))
            elif ext in [".xlsx", ".xls"]:
                df = pd.read_excel(str(data))
            elif ext == ".json":
                df = pd.read_json(str(data))
            data = df
        else:
            with open(data, "r", encoding="utf-8") as f:
                lines = [line.strip() for line in f if line.strip()]
            return [{"id": file_stem or "Doc 1", "items": [{"label": l, "text": ""} for l in lines]}]

    # Handle DataFrame
    if type(data).__name__ == "DataFrame" or hasattr(data, "iterrows"):
        try:
            import pandas as pd
        except ImportError:
            pd = None

        cols = list(data.columns)

        # Check for ID column
        id_col = None
        for col in ["article_id", "article", "pmid", "PMID", "doc_id", "doc", "group_id", "group", "paper_id", "sample_id", "file", "filename", "id", "ID"]:
            if col in cols:
                id_col = col
                break

        # Check for wide format (e.g. columns like step_1, step_2, or multiple step columns)
        remaining_cols = [c for c in cols if c != id_col]
        is_step_col_name = any(
            str(c).lower().startswith("step") or str(c).lower().startswith("s_") or str(c).lower().startswith("move") or str(c).isdigit()
            for c in remaining_cols
        )
        is_standard_long = any(
            str(c).lower() in ["label", "move_step", "annotation"] for c in cols
        ) and any(
            str(c).lower() in ["text", "sentence", "segment"] for c in cols
        )

        is_wide = (is_step_col_name and len(remaining_cols) >= 2) or (len(remaining_cols) > 2 and not is_standard_long)

        if is_wide:
            sequences = []
            for idx, row in data.iterrows():
                if id_col:
                    doc_id_str = str(row[id_col]).strip()
                    if doc_id_str.isdigit() and len(doc_id_str) >= 6:
                        doc_id_str = f"Article ID {doc_id_str}"
                else:
                    doc_id_str = f"Article ID {idx + 1:04d}"

                items = []
                for col in remaining_cols:
                    val = row[col]
                    if pd is not None:
                        if pd.isna(val):
                            continue
                    elif val is None:
                        continue
                    val_str = str(val).strip()
                    if val_str and val_str.lower() not in ["nan", "none", "null", ""]:
                        items.append({"label": val_str, "text": ""})

                if items:
                    sequences.append({"id": doc_id_str, "items": items})
            if sequences:
                return sequences

        # Fallback to standard Long format
        group_col = id_col

        label_col = None
        for col in ["label", "move_step", "move", "code", "annotation", "Label", "step"]:
            if col in data.columns:
                label_col = col
                break
        if not label_col:
            for col in data.columns:
                if col != group_col and col not in ["sentence_id", "sentence", "text", "id"]:
                    label_col = col
                    break
        if not label_col and len(data.columns) > 0:
            label_col = data.columns[0]

        text_col = None
        for col in ["text", "sentence", "segment", "Sentence", "Text"]:
            if col in data.columns:
                text_col = col
                break

        sequences = []
        if group_col:
            for group_val, group_df in data.groupby(group_col, sort=False):
                items = []
                for _, row in group_df.iterrows():
                    lbl = str(row[label_col]).strip() if label_col else ""
                    txt = str(row[text_col]) if text_col else ""
                    items.append({"label": lbl, "text": txt})
                doc_id_str = str(group_val)
                # Keep original or format PMIDs cleanly
                if doc_id_str.isdigit() and len(doc_id_str) >= 6:
                    doc_id_str = f"Article ID {doc_id_str}"
                sequences.append({"id": doc_id_str, "items": items})
        else:
            items = []
            for _, row in data.iterrows():
                lbl = str(row[label_col]).strip() if label_col else ""
                txt = str(row[text_col]) if text_col else ""
                items.append({"label": lbl, "text": txt})
            doc_name = file_stem if file_stem else "Article ID 0001"
            sequences.append({"id": doc_name, "items": items})
        return sequences

    # Handle list input
    if isinstance(data, list):
        if not data:
            return []
        
        # List of lists (multi-article)
        if isinstance(data[0], list):
            sequences = []
            for idx, seq in enumerate(data):
                items = [{"label": str(item).strip(), "text": ""} for item in seq]
                sequences.append({"id": f"Article ID {idx + 1:04d}", "items": items})
            return sequences
        
        # List of dicts
        if isinstance(data[0], dict) and ("sequence" in data[0] or "items" in data[0] or "labels" in data[0]):
            sequences = []
            for idx, item in enumerate(data):
                seq_id = item.get("id") or item.get("pmid") or item.get("article_id") or f"Article ID {idx + 1:04d}"
                raw_seq = item.get("sequence") or item.get("items") or item.get("labels") or []
                seq_items = []
                for s in raw_seq:
                    if isinstance(s, dict):
                        seq_items.append({"label": str(s.get("label", "")).strip(), "text": s.get("text", "")})
                    else:
                        seq_items.append({"label": str(s).strip(), "text": ""})
                sequences.append({"id": str(seq_id), "items": seq_items})
            return sequences

        # Single list of labels
        items = []
        for entry in data:
            if isinstance(entry, dict):
                lbl = entry.get("label") or entry.get("move") or entry.get("code") or ""
                txt = entry.get("text") or entry.get("segment") or ""
                items.append({"label": str(lbl).strip(), "text": txt})
            elif isinstance(entry, str):
                items.append({"label": entry.strip(), "text": ""})
        return [{"id": "Article ID 0001", "items": items}]

    # Handle dict input
    if isinstance(data, dict):
        sequences = []
        for key, val in data.items():
            items = []
            if isinstance(val, list):
                for entry in val:
                    if isinstance(entry, dict):
                        lbl = entry.get("label") or entry.get("move") or entry.get("code") or ""
                        txt = entry.get("text") or entry.get("segment") or ""
                        items.append({"label": str(lbl).strip(), "text": txt})
                    elif isinstance(entry, str):
                        items.append({"label": entry.strip(), "text": ""})
            sequences.append({"id": str(key), "items": items})
        return sequences

    return []


def visualize(
    data: Any,
    scheme: Union[str, Path, List[LabelSet]] = "Swales2004",
    output: Optional[Union[str, Path]] = None,
    title: Optional[Union[str, bool]] = None,
    legend: bool = True,
    color_map: Optional[Dict[str, str]] = None,
    labelling_scheme: str = "number-letter",
    font_size: int = 11,
    figure_size: Optional[Tuple[float, float]] = None,
    transparent: bool = True,
    normalize_width: Union[bool, float, int] = False,
    normalized_width: Optional[Union[bool, float, int]] = None,
    normalized: Optional[bool] = None,
    show_labels: bool = True,
    hide_labels: Optional[bool] = None,
) -> Tuple[Any, Any]:
    """
    Generates a multi-row grid DNA-strip sequence visualization of rhetorical move-step structures.

    Parameters:
    -----------
    data : Any
        CSV/Excel/JSON file path, pandas DataFrame, list of labels, or list of articles.
    scheme : str, Path, or List[LabelSet], default "Swales2004"
        Annotation scheme ('Swales2004', 'Cotos_etal2017', 'Yang_Allison2003_Results',
        'Yang_Allison2003_Discussion', or custom file path).
    output : str or Path, optional
        File path to save the generated figure (e.g. .png, .svg, .jpg, .pdf).
    title : str, bool, or None, default None
        Title for the visualization. If None or True, generates a default title. If False, hides title.
    legend : bool, default True
        Whether to include the Move-Step hierarchical legend below the chart.
    color_map : dict, optional
        Custom dictionary mapping label IDs to hex colors.
    labelling_scheme : str, default "number-letter"
        Labelling mode: 'number-letter' (e.g. 1a, 1b), 'step-only' (S1, S2),
        'simplified' (1.1, 1.2), or 'original' (M1-S1).
    font_size : int, default 11
        Base font size for chart elements.
    figure_size : tuple of (float, float), optional
        Custom figure dimensions (width, height) in inches.
    transparent : bool, default True
        Whether to save PNG/SVG with transparent background.
    normalize_width : bool, float, or int, default False
        Whether to normalize each text sequence to span the same total horizontal width.
        If True, normalizes to max_units. If a positive float or int is given, normalizes to that total width.
    normalized_width : bool, float, or int, optional
        Alias for `normalize_width`.
    normalized : bool, optional
        Alias for `normalize_width`.
    show_labels : bool, default True
        Whether to display Move-Step labels inside each cell rectangle.
    hide_labels : bool, optional
        If True, hides Move-Step labels inside cells (convenient inverse alias of show_labels).

    Returns:
    --------
    Tuple[matplotlib.figure.Figure, matplotlib.axes.Axes]
    """
    matplotlib, plt, mpatches, mlines = _ensure_matplotlib()

    sequences = extract_sequences_from_data(data)
    if not sequences:
        raise ValueError("No valid sequence data found in input.")

    scheme_colors, scheme_names, label_sets = resolve_scheme_map(scheme, custom_colors=color_map)

    num_articles = len(sequences)
    max_units = max((len(s["items"]) for s in sequences), default=1)
    if max_units == 0:
        max_units = 1

    # Determine normalization mode and target width
    is_normalized = False
    target_width = float(max_units)

    norm_val = normalize_width
    if normalized_width is not None:
        norm_val = normalized_width
    elif normalized is not None:
        norm_val = normalized

    if isinstance(norm_val, (int, float)) and not isinstance(norm_val, bool) and norm_val > 0:
        is_normalized = True
        target_width = float(norm_val)
    elif bool(norm_val):
        is_normalized = True
        target_width = float(max_units)

    # Determine label visibility
    display_labels = show_labels
    if hide_labels is not None:
        display_labels = not hide_labels

    if figure_size is None:
        span_units = target_width if is_normalized else max_units
        fig_width = max(4.0, min(32.0, span_units * 0.45 + 2.5))
        fig_height = max(2.5, num_articles * 0.45 + (1.2 if legend else 0.4))
    else:
        fig_width, fig_height = figure_size

    try:
        fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=300)
    except Exception:
        # If display backend failed (e.g. Tkinter on headless server/Windows), fallback to Agg
        plt.switch_backend("Agg")
        fig, ax = plt.subplots(figsize=(fig_width, fig_height), dpi=300)

    default_color = "#9ca3af"

    for row_idx, seq in enumerate(sequences):
        y_pos = num_articles - 1 - row_idx
        seq_len = len(seq["items"])
        if seq_len == 0:
            continue

        if is_normalized:
            step_size = target_width / seq_len
            cell_width = step_size * 0.92
            edge_lw = min(0.8, max(0.2, step_size * 0.8))
        else:
            step_size = 1.0
            cell_width = 0.92
            edge_lw = 0.8

        for x_idx, item in enumerate(seq["items"]):
            raw_label = item["label"]
            norm_key = raw_label.replace("-", "").replace("_", "").upper()

            color = scheme_colors.get(raw_label, scheme_colors.get(norm_key, default_color))

            rect_x = x_idx * step_size
            rect = mpatches.Rectangle(
                (rect_x, y_pos),
                cell_width,
                0.85,
                linewidth=edge_lw,
                edgecolor="#ffffff",
                facecolor=color,
            )
            ax.add_patch(rect)

            if display_labels:
                display_text = format_label_text(raw_label, mode=labelling_scheme)
                if display_text:
                    text_color = get_contrast_text_color(color)
                    effective_font_size = font_size
                    if is_normalized and step_size < 0.75:
                        effective_font_size = max(4, int(font_size * (step_size / 0.75)))
                    ax.text(
                        rect_x + cell_width / 2.0,
                        y_pos + 0.425,
                        display_text,
                        ha="center",
                        va="center",
                        fontsize=max(4, effective_font_size),
                        color=text_color,
                    )

    if is_normalized and target_width != max_units:
        ax.set_aspect('auto')
        ax.set_xlim(-0.2 * (target_width / max_units), target_width + 0.5 * (target_width / max_units))
    else:
        ax.set_aspect('equal')
        xlim_max = target_width if is_normalized else max_units
        ax.set_xlim(-0.2, xlim_max + 0.5)
    ax.set_ylim(-0.2, num_articles)

    y_tick_positions = [num_articles - 1 - i + 0.425 for i in range(num_articles)]
    y_tick_labels = [s["id"] for s in sequences]

    ax.set_yticks(y_tick_positions)
    ax.set_yticklabels(y_tick_labels, fontsize=font_size - 2, color="#4b5563", family="sans-serif")
    ax.set_xticks([])

    for spine in ax.spines.values():
        spine.set_visible(False)
    ax.tick_params(left=False, bottom=False)

    if title is not False:
        if title is True or title is None:
            title_text = "Move-Step Analysis"
        else:
            title_text = str(title)
        ax.set_title(title_text, fontsize=font_size + 3, pad=14, weight="bold", loc="left")

    if legend and label_sets:
        draw_hierarchical_legend(fig, ax, label_sets, font_size=font_size - 2, labelling_scheme=labelling_scheme)

    plt.tight_layout()

    if output:
        out_path = Path(output)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        is_png_or_svg = out_path.suffix.lower() in [".png", ".svg"]
        save_kwargs = {
            "bbox_inches": "tight",
            "dpi": 300,
        }
        if is_png_or_svg:
            save_kwargs["transparent"] = transparent
        else:
            save_kwargs["facecolor"] = "white"
            save_kwargs["transparent"] = False

        try:
            plt.savefig(out_path, **save_kwargs)
        except Exception:
            plt.switch_backend("Agg")
            plt.savefig(out_path, **save_kwargs)

    return fig, ax


def draw_hierarchical_legend(
    fig: Any,
    ax: Any,
    label_sets: List[LabelSet],
    font_size: int = 7,
    labelling_scheme: str = "number-letter",
):
    """
    Renders a reduced, hierarchical Move-Step legend below the main grid.
    Grouped by Move with step color swatches matching the labelling scheme.
    """
    import matplotlib.patches as mpatches
    import matplotlib.lines as mlines

    # Add divider line above legend (extended width)
    divider = mlines.Line2D([0, 1.0], [-0.08, -0.08], transform=ax.transAxes, color="#9ca3af", linewidth=0.8)
    ax.add_line(divider)

    columns = []
    for lset in label_sets:
        col = []
        move_name = lset.name
        # Add invisible Move header patch without colon
        col.append((mpatches.Patch(color='none'), f"{move_name}"))

        for lbl in lset.labels:
            fmt_lbl = format_label_text(lbl.id, mode=labelling_scheme)
            step_name = lbl.name.split(":", 1)[-1].strip() if ":" in lbl.name else lbl.name
            full_label = f"{fmt_lbl}: {step_name}" if step_name != fmt_lbl else fmt_lbl
            col.append((mpatches.Patch(facecolor=lbl.color, edgecolor="white"), full_label))
        columns.append(col)

    if not columns:
        return

    max_rows = max(len(col) for col in columns)
    handles = []
    labels = []

    # Map into a column-major flattened list for ax.legend
    for col in columns:
        for i in range(max_rows):
            if i < len(col):
                h, l = col[i]
            else:
                h, l = mpatches.Patch(color='none'), ""
            handles.append(h)
            labels.append(l)

    leg = ax.legend(
        handles=handles,
        labels=labels,
        loc="upper left",
        bbox_to_anchor=(0.0, -0.1),
        ncol=len(columns),
        fontsize=font_size,
        frameon=False,
        handlelength=1.0,
        handleheight=1.0,
        columnspacing=1.5,
        handletextpad=0.4,
    )

    if leg:
        for i, text in enumerate(leg.get_texts()):
            txt = text.get_text()
            # The headers are the first items of each column
            if i % max_rows == 0 and txt:
                text.set_weight("bold")
                text.set_color("#374151")
            elif txt == "":
                pass
            else:
                text.set_color("#6b7280")
