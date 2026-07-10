# SHACL Wizard vs. LUBM reference schemas -- evaluation summary

- LUBM dataset: `lubm-skg-1.ttl` (1,001,716 triples)
- Cardinality-inference limit used: 2,000,000 triples (default wizard setting is 10,000; raised here so cardinality inference actually runs against the full ~1M-triple file -- see script docstring)
- Inference limited (cardinality skipped)? **False**

## Per-schema results

| Schema | Shapes | Ref. properties | Recall | Precision | nodeKind acc. | Cardinality acc. | Datatype acc. | Constraint acc. |
|---|---|---|---|---|---|---|---|---|
| Schema 1 | 3 | 12 | 100% | 92% | 100% | 8% | 100% | 69% |
| Schema 2 | 7 | 24 | 96% | 100% | 100% | 9% | 100% | 70% |
| Schema 3 | 14 | 75 | 97% | 100% | 100% | 4% | 100% | 68% |

## Quotable summary

- **Schema 1**: recall 100%, precision 92%, constraint accuracy 69% (nodeKind 100% / cardinality 8% / datatype 100%)
- **Schema 2**: recall 96%, precision 100%, constraint accuracy 70% (nodeKind 100% / cardinality 9% / datatype 100%)
- **Schema 3**: recall 97%, precision 100%, constraint accuracy 68% (nodeKind 100% / cardinality 4% / datatype 100%)

## Methodology notes

- Properties detected per class come from `properties_by_class` (correctly scoped per `rdf:type`). Constraints applied to a property come from the flat, graph-wide `suggested_constraints` dict -- the current implementation does not scope statistical constraint inference per target class, only per property path (matches the real wizard's Step 3/4 behaviour, confirmed against the frontend source).
- Expected nodeKind is derived empirically from actual value types in the LUBM data (IRI vs Literal), not from the reference schemas' sh:node annotations, because the reference schemas omit sh:node for some object properties (e.g. `ub:advisor`). Because this check uses the same all-IRI/all-Literal logic the wizard's own inference uses, nodeKind (and datatype, which is trivially None/None since LUBM literals are untyped and the reference never asserts datatype) are expected to be near 100% by construction -- cardinality is the metric with genuine signal, since the wizard's statistical inference can only ever produce minCount=1/maxCount=1 and therefore structurally cannot match reference bounds such as maxCount=2, 3, 4, or 7.
