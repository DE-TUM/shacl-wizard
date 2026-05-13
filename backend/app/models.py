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
    language_in: str | None = Field(default=None, alias="languageIn")

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


class WizardState(CamelModel):
    mode: str | None = None
    step: int | None = None
    target_type: TargetType | None = Field(default=None, alias="targetType")
    target_value: str = Field(default="", alias="targetValue")
    shape_name: str = Field(default="", alias="shapeName")
    properties: list[PropertyShape] = Field(default_factory=list)
    nl_description: str = Field(default="", alias="nlDescription")
    use_nl: bool = Field(default=False, alias="useNL")
    nl_parsed: bool = Field(default=False, alias="nlParsed")
    output_tab: OutputTab = Field(default="turtle", alias="outputTab")
    uploaded_file_name: str = Field(default="", alias="uploadedFileName")
    suggested_classes: list[str] = Field(default_factory=list, alias="suggestedClasses")
    suggested_properties: list[str] = Field(default_factory=list, alias="suggestedProperties")

    @field_validator("target_type", mode="before")
    @classmethod
    def normalize_target_type(cls, value: object) -> object:
        return empty_string_to_none(value)


class ParseNLRequest(CamelModel):
    description: str = Field(min_length=1)
    target_type: TargetType | None = Field(default=None, alias="targetType")
    target_value: str | None = Field(default=None, alias="targetValue")
    shape_name: str | None = Field(default=None, alias="shapeName")

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
    prefixes: dict[str, str]
    detected_datatypes: dict[str, str] = Field(alias="detectedDatatypes")


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
