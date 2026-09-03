from click.testing import CliRunner
from movestepviz.cli import cli

def test_cli_list_schemes():
    runner = CliRunner()
    result = runner.invoke(cli, ["scheme", "list"])
    assert result.exit_code == 0
    assert "Available Pre-set Annotation Schemes" in result.output
