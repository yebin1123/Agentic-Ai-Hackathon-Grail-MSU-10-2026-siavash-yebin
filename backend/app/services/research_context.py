"""Transparent research lenses and snapshot-derived arguments; no risk score."""
from app.schemas.research_profile import Argument, ContextNote, ProsCons


def personalized_notes(profile, asset, snapshot):
    if profile is None:
        return []
    notes = []
    intro = f"{profile.display_name}, " if profile.display_name else ""
    experience = {
        "beginner": "Start with what the token does, custody basics, and the difference between market cap and FDV.",
        "intermediate": "Compare the reported valuation and activity with independently verified usage and token economics.",
        "advanced": "Investigate source methodology, venue dispersion, emissions, governance controls and token value capture.",
    }
    notes.append(ContextNote(title="Your research lens", detail=intro + experience[profile.experience]
                             + f" These are research priorities for {asset.name}, not a suitability assessment."))
    if profile.horizon == "short" or profile.liquidity_need == "soon":
        detail = "Your short horizon or near-term access needs make exit liquidity, slippage and historical downside important research questions. A 24-hour snapshot cannot establish whether you could exit when needed."
    elif profile.horizon == "long":
        detail = "For your longer research horizon, prioritize supply schedules, sustained usage, token value capture and custody/protocol exposure rather than a single day's price move."
    else:
        detail = "For your medium research horizon, inspect comparable historical windows and dated catalysts alongside supply and liquidity evidence."
    notes.append(ContextNote(title="Horizon and access needs", detail=detail))
    if profile.loss_tolerance == "low" or profile.loss_capacity == "low":
        detail = "You reported low willingness or ability to absorb losses. Focus on downside scenarios and essential liquidity needs; no crypto asset is certified safe here, and the profile does not establish an appropriate investment amount."
    elif profile.loss_capacity == "unknown":
        detail = "Your ability to absorb losses is unknown. Willingness to take risk is not the same as capacity; do not infer an investment amount from this profile."
    else:
        detail = "Your stated willingness and ability to accept losses do not establish that a particular token or leverage strategy is suitable. Examine downside and liquidity evidence independently."
    notes.append(ContextNote(title="Willingness versus capacity", detail=detail))
    if profile.goal == "trading_risk":
        notes.append(ContextNote(title="Trading-risk questions", detail="Inspect venue-specific depth, fees, funding and leverage exposure. Reported volume is not execution depth; these trading datasets are not connected."))
    elif profile.goal == "long_term_research":
        notes.append(ContextNote(title="Thesis research", detail="Write the thesis, evidence against it, and what would change your mind. Verify fundamentals and governance using primary sources; this snapshot alone cannot establish a bull case."))
    if profile.interests:
        notes.append(ContextNote(title="Your interests", detail="Prioritize evidence relevant to " + ", ".join(profile.interests)
                                 + ". An interest is not evidence that this asset belongs to that category or has those capabilities."))
    if snapshot.change_24h_percent is not None:
        notes.append(ContextNote(title="Observed context, not a risk score", detail=f"{asset.symbol}'s reported 24-hour change is {snapshot.change_24h_percent:+.2f}%. This is a return, not realized volatility, a forecast, or a measure of fit with your profile."))
    return notes


def asset_arguments(asset, snapshot, sources):
    """Rules use reported values, never static asset-specific investment claims."""
    result = ProsCons()
    evidence = [source.source_id for source in sources if source.source_id == "market"]
    # Without attributable market evidence, no asset-specific pros/cons are asserted.
    if not evidence:
        result.unknowns.append(Argument(title="No attributable snapshot evidence",
            detail=f"A sourced market snapshot for {asset.name} is unavailable. No strengths or concerns are invented to fill the list.", interpretation=False))
    else:
        if snapshot.max_supply is not None and snapshot.max_supply > 0:
            result.pros.append(Argument(title="Reported maximum-supply reference",
                detail=f"The provider reports a maximum supply of {snapshot.max_supply:,.4f} {asset.symbol}. A reported bound can help frame supply research, but it is not a verified immutable rule or a guarantee against dilution.", source_ids=evidence))
        if snapshot.volume_24h_usd is not None and snapshot.volume_24h_usd > 0:
            result.pros.append(Argument(title="Reported trading activity",
                detail=f"The provider reports ${snapshot.volume_24h_usd:,.2f} of 24-hour trading volume for {asset.symbol} ({snapshot.volume_scope or 'scope unavailable'}). This offers activity context; it does not prove organic demand, low slippage or reliable exit liquidity.", source_ids=evidence))
        cap, fdv = snapshot.market_cap_usd, snapshot.fully_diluted_valuation_usd
        if cap is not None and fdv is not None and cap > 0 and fdv > 0:
            if cap < fdv:
                result.cons.append(Argument(title="Reported valuation gap",
                    detail=f"{asset.symbol}'s market cap / FDV is {cap / fdv:.2f}; reported FDV exceeds circulating market cap. This raises a supply-basis research question, not proof of future selling or an unlock schedule.", source_ids=evidence))
            elif cap > fdv:
                result.unknowns.append(Argument(title="Valuation definitions need checking",
                    detail="Reported market cap exceeds FDV. Verify provider supply definitions before interpreting a dilution ratio.", source_ids=evidence))
            else:
                result.pros.append(Argument(title="No gap in reported cap and FDV",
                    detail=f"Reported market cap and FDV for {asset.symbol} are equal in this snapshot. That limits this particular valuation gap, but does not establish absence of future emissions or selling pressure.", source_ids=evidence))
        if snapshot.change_24h_percent is not None and snapshot.change_24h_percent < 0:
            result.cons.append(Argument(title="Recent downside observed",
                detail=f"{asset.symbol}'s reported 24-hour price change is {snapshot.change_24h_percent:+.2f}%. This documents recent downside only; it does not predict the next move or measure volatility.", source_ids=evidence, interpretation=False))
        missing = []
        for name, value in (("maximum supply", snapshot.max_supply), ("market cap", cap),
                            ("FDV", fdv), ("USD volume", snapshot.volume_24h_usd)):
            if value is None:
                missing.append(name)
        if missing:
            result.unknowns.append(Argument(title="Missing snapshot fields", detail=f"Unavailable for {asset.symbol}: " + ", ".join(missing)
                + ". Missing data is not zero and is not evidence of a bad asset.", source_ids=evidence, interpretation=False))
    result.unknowns.append(Argument(title="Project-level thesis not verified",
        detail=f"Primary documentation, usage/revenue trends, holder concentration, governance and security evidence for {asset.name} have not been retrieved. These lists are snapshot research signals, not a comprehensive fundamental assessment.", interpretation=False))
    result.unknowns.append(Argument(title="Execution liquidity and future supply",
        detail="Order-book/pool depth, slippage and verified vesting/emission schedules are not connected. Reported volume and FDV do not replace those datasets.", interpretation=False))
    return result
