from __future__ import annotations

from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator

TargetType = Literal["class", "node", "subjectsOf", "objectsOf"]
OutputTab = Literal["turtle", "jsonld", "rdfxml", "trig"]
ValidationStatus = Literal["valid", "invalid"]
ParserSource = Literal["groq", "gemini", "heuristic"]


def make_id() -> str:
    return uuid4().hex[:8]


def empty_string_to_none(value: object) -> object:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


class SubShape(CamelModel):
    """A one-level nested shape used inside a logical/qualified constraint.

    Reuses the value-level constraint vocabulary only — no path, no cardinality,
    and no further logical nesting — which keeps the model bounded and the UI
    demo-ready (Phase 5, approved design).
    """
    datatype: str | None = None
    node_kind: str | None = Field(default=None, alias="nodeKind")
    class_: str | None = Field(default=None, alias="class")
    node_: str | None = Field(default=None, alias="node")
    pattern: str | None = None
    min_inclusive: str | None = Field(default=None, alias="minInclusive")
    max_inclusive: str | None = Field(default=None, alias="maxInclusive")
    min_exclusive: str | None = Field(default=None, alias="minExclusive")
    max_exclusive: str | None = Field(default=None, alias="maxExclusive")
    min_length: str | None = Field(default=None, alias="minLength")
    max_length: str | None = Field(default=None, alias="maxLength")
    in_: str | None = Field(default=None, alias="in")
    has_value: str | None = Field(default=None, alias="hasValue")
    language_in: str | None = Field(default=None, alias="languageIn")

    @field_validator("*", mode="before")
    @classmethod
    def normalize_empty_values(cls, value: object) -> object:
        return empty_string_to_none(value)


class PropertyConstraints(CamelModel):
    min_count: str | None = Field(default=None, alias="minCount")
    max_count: str | None = Field(default=None, alias="maxCount")
    datatype: str | None = None
    node_kind: str | None = Field(default=None, alias="nodeKind")
    pattern: str | None = None
    min_inclusive: str | None = Field(default=None, alias="minInclusive")
    max_inclusive: str | None = Field(default=None, alias="maxInclusive")
    min_exclusive: str | None = Field(default=None, alias="minExclusive")
    max_exclusive: str | None = Field(default=None, alias="maxExclusive")
    min_length: str | None = Field(default=None, alias="minLength")
    max_length: str | None = Field(default=None, alias="maxLength")
    in_: str | None = Field(default=None, alias="in")
    class_: str | None = Field(default=None, alias="class")
    node_: str | None = Field(default=None, alias="node")
    language_in: str | None = Field(default=None, alias="languageIn")
    has_value: str | None = Field(default=None, alias="hasValue")
    unique_lang: str | None = Field(default=None, alias="uniqueLang")  # "true" when enabled
    # Property-pair constraints — each references another property path in the
    # same NodeShape.
    equals: str | None = None
    disjoint: str | None = None
    less_than: str | None = Field(default=None, alias="lessThan")
    less_than_or_equals: str | None = Field(default=None, alias="lessThanOrEquals")
    # Logical / qualified constraints (Phase 5). Each sub-shape is one level deep.
    and_: list[SubShape] | None = Field(default=None, alias="and")
    or_: list[SubShape] | None = Field(default=None, alias="or")
    xone: list[SubShape] | None = None
    not_: SubShape | None = Field(default=None, alias="not")
    qualified_value_shape: SubShape | None = Field(default=None, alias="qualifiedValueShape")
    qualified_min_count: str | None = Field(default=None, alias="qualifiedMinCount")
    qualified_max_count: str | None = Field(default=None, alias="qualifiedMaxCount")
    # sh:message — a human-readable annotation, NOT one of the 28 SHACL Core
    # constraint components. Customises the validation report text for this
    # property shape; never counted toward the coverage goal.
    message: str | None = None

    @field_validator("*", mode="before")
    @classmethod
    def normalize_empty_values(cls, value: object) -> object:
        return empty_string_to_none(value)


class PropertyShape(CamelModel):
    id: str = Field(default_factory=make_id)
    path: str
    constraints: PropertyConstraints = Field(default_factory=PropertyConstraints)

    @field_validator("path", mode="before")
    @classmethod
    def normalize_path(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class CompletedShape(CamelModel):
    shape_name: str = Field(alias="shapeName")
    target_type: TargetType | None = Field(default=None, alias="targetType")
    target_value: str = Field(default="", alias="targetValue")
    properties: list[PropertyShape] = Field(default_factory=list)
    # Optional sh:message annotation for the whole NodeShape (see note above).
    shape_message: str = Field(default="", alias="shapeMessage")
    # sh:closed — when True, only the declared property paths are allowed.
    closed: bool = Field(default=False)
    ignored_properties: str = Field(default="", alias="ignoredProperties")

    @field_validator("target_type", mode="before")
    @classmethod
    def normalize_target_type(cls, value: object) -> object:
        return empty_string_to_none(value)


class WizardState(CamelModel):
    mode: str | None = None
    step: int | None = None
    target_type: TargetType | None = Field(default=None, alias="targetType")
    target_value: str = Field(default="", alias="targetValue")
    shape_name: str = Field(default="", alias="shapeName")
    shape_message: str = Field(default="", alias="shapeMessage")
    closed: bool = Field(default=False)
    ignored_properties: str = Field(default="", alias="ignoredProperties")
    properties: list[PropertyShape] = Field(default_factory=list)
    nl_description: str = Field(default="", alias="nlDescription")
    use_nl: bool = Field(default=False, alias="useNL")
    nl_parsed: bool = Field(default=False, alias="nlParsed")
    output_tab: OutputTab = Field(default="turtle", alias="outputTab")
    uploaded_file_name: str = Field(default="", alias="uploadedFileName")
    suggested_classes: list[str] = Field(default_factory=list, alias="suggestedClasses")
    suggested_properties: list[str] = Field(default_factory=list, alias="suggestedProperties")
    completed_shapes: list[CompletedShape] = Field(default_factory=list, alias="completedShapes")
    selected_prefix: str = Field(default="ex", alias="selectedPrefix")
    selected_namespace: str = Field(default="http://example.org/", alias="selectedNamespace")
    detected_prefixes: dict[str, str] = Field(default_factory=dict, alias="detectedPrefixes")

    @field_validator("target_type", mode="before")
    @classmethod
    def normalize_target_type(cls, value: object) -> object:
        return empty_string_to_none(value)


class ParseNLRequest(CamelModel):
    description: str = Field(min_length=1)
    target_type: TargetType | None = Field(default=None, alias="targetType")
    target_value: str | None = Field(default=None, alias="targetValue")
    shape_name: str | None = Field(default=None, alias="shapeName")
    prefixes: dict[str, str] = Field(default_factory=dict)
    selected_prefix: str | None = Field(default=None, alias="selectedPrefix")
    existing_shapes: list[str] = Field(default_factory=list, alias="existingShapes")

    @field_validator("target_type", mode="before")
    @classmethod
    def normalize_target_type(cls, value: object) -> object:
        return empty_string_to_none(value)


class ParseNLResponse(CamelModel):
    properties: list[PropertyShape]
    summary: list[str] = Field(default_factory=list)
    source: ParserSource
    warnings: list[str] = Field(default_factory=list)


class GenerateResponse(CamelModel):
    formats: dict[str, str]
    shape_uri: str = Field(alias="shapeUri")
    summary: list[str]


class ParseRDFResponse(CamelModel):
    classes: list[str]
    properties: list[str]
    properties_by_class: dict[str, list[str]] = Field(
        default_factory=dict, alias="propertiesByClass"
    )
    prefixes: dict[str, str]
    detected_datatypes: dict[str, str] = Field(alias="detectedDatatypes")
    suggested_constraints: dict[str, dict] = Field(
        default_factory=dict, alias="suggestedConstraints"
    )
    inference_limited: bool = Field(default=False, alias="inferenceLimited")


class OntologyParseResponse(CamelModel):
    """Declared (not statistical) schema facts extracted from an OWL/RDFS ontology.

    Property keys are CURIEs and class values are local names, matching the
    conventions already used by ParseRDFResponse, so the frontend can merge the
    two sources without a convention mismatch.
    """
    functional_properties: list[str] = Field(default_factory=list, alias="functionalProperties")
    property_domains: dict[str, list[str]] = Field(default_factory=dict, alias="propertyDomains")
    property_ranges: dict[str, dict] = Field(default_factory=dict, alias="propertyRanges")
    class_hierarchy: dict[str, str] = Field(default_factory=dict, alias="classHierarchy")
    # owl:Restriction cardinality/value-type facts, scoped to the class they were
    # declared on (via rdfs:subClassOf or owl:equivalentClass) - {class local name
    # -> {property CURIE -> constraint fields}}. Kept separate from the four
    # fields above, which are all global-per-property; a restriction only holds
    # for the specific class it's attached to.
    class_restricted_constraints: dict[str, dict[str, dict]] = Field(
        default_factory=dict, alias="classRestrictedConstraints"
    )
    # Every class declared anywhere in the ontology - explicit owl:Class/rdfs:Class
    # declarations, plus every class name that surfaces via the fields above
    # (classHierarchy, propertyDomains, classRestrictedConstraints). None of those
    # three alone is a complete class list (e.g. a class with no subClassOf, no
    # property domain, and no restriction never appears in any of them), so this
    # is the union - same local-name convention as ParseRDFResponse.classes.
    classes: list[str] = Field(default_factory=list)
    prefixes: dict[str, str] = Field(default_factory=dict)


class Violation(CamelModel):
    focus_node: str = Field(alias="focusNode")
    property: str
    message: str
    severity: str | None = None
    source_constraint: str | None = Field(default=None, alias="sourceConstraint")
    value: str | None = None


class ValidationResponse(CamelModel):
    status: ValidationStatus
    conforms: bool
    violations: list[Violation]
    data_file: str = Field(alias="dataFile")
    report_text: str = Field(alias="reportText")
