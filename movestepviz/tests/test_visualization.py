import os
import tempfile
# pyrefly: ignore [missing-import]
import pytest
from movestepviz.visualization import visualize, format_label_text, extract_sequences_from_data
from click.testing import CliRunner
from movestepviz.cli import cli

def test_format_label_text():
    assert format_label_text("M1-S1", mode="original") == "M1-S1"
    assert format_label_text("M1-S1", mode="simplified") == "1.1"
    assert format_label_text("M1-S1", mode="number-letter") == "1a"
    assert format_label_text("M1-S1", mode="step-only") == "S1"
    assert format_label_text("M2-S1B", mode="step-only") == "S1B"
    assert format_label_text("HEADING", mode="step-only") == "H"
    assert format_label_text("OTHER", mode="step-only") == "O"

def test_extract_multi_sequences():
    multi_list = [
        ["M1-S1", "M1-S2", "M2-S1"],
        ["M1-S1", "M1-S3", "M3-S1"]
    ]
    seqs = extract_sequences_from_data(multi_list)
    assert len(seqs) == 2
    assert seqs[0]["id"] == "Article ID 0001"
    assert len(seqs[0]["items"]) == 3

def test_visualize_multi_sequence_grid():
    multi_list = [
        ["M1-S1", "M1-S2", "M2-S1"],
        ["M1-S1", "M1-S3", "M3-S1"]
    ]
    fig, ax = visualize(multi_list, scheme="Cotos_etal2017")
    assert fig is not None
    assert ax is not None

def test_visualize_file_output():
    labels = ["M1-S1", "M1-S2", "M2-S1"]
    with tempfile.TemporaryDirectory() as tmpdir:
        out_png = os.path.join(tmpdir, "test_out.png")
        visualize(labels, scheme="Swales2004", output=out_png)
        assert os.path.exists(out_png)
        assert os.path.getsize(out_png) > 0

        out_svg = os.path.join(tmpdir, "test_out.svg")
        visualize(labels, scheme="Swales2004", output=out_svg)
        assert os.path.exists(out_svg)
        assert os.path.getsize(out_svg) > 0

def test_cli_visualize():
    runner = CliRunner()
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "data.csv")
        out_path = os.path.join(tmpdir, "output.png")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("pmid,label\n0001,M1-S1\n0001,M1-S2\n0001,M2-S1\n")
        
        result = runner.invoke(cli, ["visualize", csv_path, "-o", out_path, "-s", "Cotos_etal2017"])
        assert result.exit_code == 0
        assert os.path.exists(out_path)

def test_extract_wide_format_csv():
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "wide.csv")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("article_id,step_1,step_2,step_3\n26643288,M1-S1,M1-S2,M2-S1\n29334235,M1-S2,M1-S4,\n")
        
        seqs = extract_sequences_from_data(csv_path)
        assert len(seqs) == 2
        assert seqs[0]["id"] == "Article ID 26643288"
        assert len(seqs[0]["items"]) == 3
        assert seqs[1]["id"] == "Article ID 29334235"
        assert len(seqs[1]["items"]) == 2  # trailing empty cell ignored

def test_visualize_normalized_width():
    multi_list = [
        ["M1-S1", "M1-S2"],
        ["M1-S1", "M1-S2", "M1-S3", "M2-S1", "M2-S2", "M3-S1"]
    ]
    # Test boolean normalize_width
    fig, ax = visualize(multi_list, scheme="Swales2004", normalize_width=True)
    assert fig is not None
    assert ax is not None

    # Test numeric normalize_width
    fig2, ax2 = visualize(multi_list, scheme="Swales2004", normalize_width=50.0)
    assert fig2 is not None
    assert ax2 is not None

def test_visualize_hide_labels():
    labels = ["M1-S1", "M1-S2", "M2-S1"]
    # Test show_labels=False
    fig, ax = visualize(labels, scheme="Swales2004", show_labels=False)
    # Check that ax has no text children with label text (title and yticklabels may exist)
    cell_texts = [t.get_text() for t in ax.texts if t.get_text() in ["1a", "1b", "2a", "M1-S1", "M1-S2", "M2-S1"]]
    assert len(cell_texts) == 0

    # Test hide_labels=True
    fig2, ax2 = visualize(labels, scheme="Swales2004", hide_labels=True)
    cell_texts2 = [t.get_text() for t in ax2.texts if t.get_text() in ["1a", "1b", "2a", "M1-S1", "M1-S2", "M2-S1"]]
    assert len(cell_texts2) == 0

def test_cli_normalize_and_hide_labels():
    runner = CliRunner()
    with tempfile.TemporaryDirectory() as tmpdir:
        csv_path = os.path.join(tmpdir, "data.csv")
        out_path = os.path.join(tmpdir, "output.png")
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write("pmid,label\n0001,M1-S1\n0001,M1-S2\n0002,M1-S1\n0002,M1-S2\n0002,M2-S1\n")
        
        result = runner.invoke(cli, ["visualize", csv_path, "-o", out_path, "--normalize-width", "--hide-labels"])
        assert result.exit_code == 0
        assert os.path.exists(out_path)

