"""Streamlit readout app (``[app]`` extra): pick a golden readout case or a CSV + params.

    analytics/.venv/Scripts/python -m streamlit run analytics/abkit/src/abkit/readout/app.py

The memo is the same Markdown as ``abkit readout``; an SRM failure also shows a red banner.
"""

from __future__ import annotations

from pathlib import Path

import streamlit as st

from abkit.cli import DEFAULT_GOLDEN_ROOT
from abkit.golden.case import GoldenFormatError
from abkit.readout.inputs import ReadoutInput, list_readout_cases, load_readout_input

_KINDS = {"Simulated (virtual users)": True, "Real users": False}


def _case_input() -> ReadoutInput | None:
    root = Path(st.sidebar.text_input("Golden dataset", str(DEFAULT_GOLDEN_ROOT), key="root"))
    cases = {f"{p.parent.name}/{p.name}": p for p in list_readout_cases(root)}
    if not cases:
        st.warning(f"No readout cases under {root}.")
        return None
    chosen = st.sidebar.selectbox("Case", list(cases), key="case")
    return load_readout_input(cases[chosen])


def _csv_input() -> ReadoutInput | None:
    csv = st.sidebar.text_input("CSV (one row per enrolled user)", key="csv")
    params = st.sidebar.text_input("Params JSON", key="params")
    kind = st.sidebar.radio("Users", list(_KINDS), key="kind")
    if not csv or not params:
        st.info("Enter a CSV path and a params JSON path.")
        return None
    return load_readout_input(Path(csv), Path(params), _KINDS[kind])


def main() -> None:
    st.set_page_config(page_title="abkit readout", layout="centered")
    source = st.sidebar.radio("Source", ["Golden case", "CSV + params"], key="source")
    try:
        inp = _case_input() if source == "Golden case" else _csv_input()
        if inp is None:
            return
        readout = inp.readout()
        memo = inp.memo()
    except (GoldenFormatError, ValueError, OSError) as err:
        st.error(f"Cannot read this experiment: {err}")
        return
    if readout.blocked:
        st.error("Conclusion blocked: the sample ratio check failed, so no effect is shown.")
    st.markdown(memo)
    st.download_button("Download memo (.md)", memo, file_name="readout.md")


main()
