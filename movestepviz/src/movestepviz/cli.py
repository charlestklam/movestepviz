import click

from movestepviz.config import PRESET_SCHEMES, DEFAULT_LABEL_SETS, load_custom_scheme
from movestepviz.text_processing import segment_text

@click.group()
def cli():
    """MoveStepViz CLI tool for Move-Step analysis and text sequence visualization."""
    pass

@cli.group()
def scheme():
    """Manage annotation schemes."""
    pass

@scheme.command(name="list")
def list_schemes():
    """List built-in move-step schemes."""
    click.echo("Available Pre-set Annotation Schemes:")
    for name, label_sets in PRESET_SCHEMES.items():
        click.echo(f"  - {name} ({len(label_sets)} move sets)")

@scheme.command(name="parse")
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--output", "-o", type=click.Path(), help="Output path for JSON schema.")
def parse_scheme(file_path, output):
    """Parse custom scheme file (`label;move;step`)."""
    label_sets = load_custom_scheme(file_path)
    json_data = [ls.model_dump() for ls in label_sets]
    
    if output:
        import json
        with open(output, "w", encoding="utf-8") as f:
            json.dump(json_data, f, indent=2)
        click.echo(f"Saved parsed schema to {output}")
    else:
        import json
        click.echo(json.dumps(json_data, indent=2))

@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--text-column", "-t", default="text", help="Column name containing text to process.")
@click.option("--scheme", "-s", default="Swales2004", help="Annotation scheme ID or custom scheme file.")
@click.option("--output", "-o", type=click.Path(), help="Output path for processed CSV/JSONL.")
def process(file_path, text_column, scheme, output):
    """Process dataset file into sentence segment units."""
    click.echo(f"Processing {file_path} with scheme '{scheme}'...")

@cli.command()
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--scheme", "-s", default="Swales2004", help="Preset scheme name or custom scheme file path.")
@click.option("--output", "-o", default="figure.png", help="Output file path (e.g. figure.png, figure.svg).")
@click.option("--title", "-t", default="Move-Step Analysis", help="Title for the chart.")
@click.option("--no-title", is_flag=True, help="Hide the title completely.")
@click.option("--no-legend", is_flag=True, help="Hide the legend.")
@click.option("--colors", "-c", type=click.Path(exists=True), help="JSON file mapping label IDs to hex colors.")
@click.option("--labelling-scheme", "-l", default="number-letter", type=click.Choice(["original", "simplified", "number-letter"]), help="Labelling scheme format.")
@click.option("--font-size", default=11, type=int, help="Base font size.")
@click.option("--normalize-width", is_flag=True, default=False, help="Normalize all text sequences to the same total width.")
@click.option("--hide-labels", is_flag=True, default=False, help="Hide Move-Step label text inside cells.")
def visualize(file_path, scheme, output, title, no_title, no_legend, colors, labelling_scheme, font_size, normalize_width, hide_labels):
    """Generate DNA-strip visualization chart from annotated dataset."""
    import json
    from movestepviz.visualization import visualize as viz_fn
    click.echo(f"Generating visualization for {file_path} using scheme '{scheme}'...")
    
    color_map = None
    if colors:
        with open(colors, "r", encoding="utf-8") as f:
            color_map = json.load(f)
            
    final_title = False if no_title else title

    viz_fn(
        data=file_path,
        scheme=scheme,
        output=output,
        title=final_title,
        legend=not no_legend,
        color_map=color_map,
        labelling_scheme=labelling_scheme,
        font_size=font_size,
        normalize_width=normalize_width,
        hide_labels=hide_labels,
    )
    click.echo(f"Visualization saved to {output}")

if __name__ == "__main__":
    cli()
