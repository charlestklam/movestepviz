import pytest
from movestepviz.text_processing import segment_text

def test_segment_text():
    text = "Sentence one. Sentence two!"
    res = segment_text(text)
    assert len(res) == 2
    assert res[0] == "Sentence one."
    assert res[1] == "Sentence two!"
