"""Ad-hoc probe: run the NL parser on the Employee test description and print
the constraints most relevant to the two known weak spots (lessThan direction,
qualifiedValueShape vs flat class+minCount). Not a committed test.

    python -m tests.nl_probe            # default provider order (groq first)
    python -m tests.nl_probe gemini     # force gemini
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings
from app.models import ParseNLRequest
from app.services.llm_parser import parse_natural_language

DESCRIPTION = """Validate every Employee with these exact rules:

- Each employee must have exactly one fullName: a string between 2 and 100 characters long.
- Each employee must have at least one email: a string matching the regex ^[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}$. For the email property, show the custom validation message "Please provide a valid work email address."
- Each employee must have exactly one age: an integer between 18 and 65 inclusive.
- Each employee must have exactly one salary: a decimal strictly greater than 0.
- Each employee must have exactly one status, and its value must be one of "active", "inactive", or "onleave".
- Each employee must have exactly one employmentType, and it must include the value "fulltime".
- Each employee has an optional homepage, which must be an IRI (a named resource, not a literal value).
- Each employee must work for exactly one department (worksFor), and that value must conform to the DepartmentShape.
- Each employee's manager must be an instance of the class ex:Person.
- Each employee may have several labels; only English and German are allowed, and there may be at most one label per language.
- Each employee must have exactly one startDate and exactly one endDate, both dates, and startDate must be strictly before endDate.
- Each employee has one reviewDate that must be on or before the endDate.
- An employee's homeEmail and workEmail must not share any value.
- Each employee must have exactly one identifier, which is either a string or an integer.
- Each employee must have at least two teamMembers that are instances of ex:Manager.
"""

INTERESTING = (
    "lessThan", "lessThanOrEquals", "equals", "disjoint",
    "qualifiedValueShape", "qualifiedMinCount", "qualifiedMaxCount",
    "and", "or", "xone", "not", "class", "minCount", "maxCount",
)


def main() -> int:
    settings = get_settings()
    if len(sys.argv) > 1:
        object.__setattr__(settings, "llm_provider", sys.argv[1])

    req = ParseNLRequest(
        description=DESCRIPTION,
        targetType="class",
        targetValue="Employee",
        shapeName="EmployeeShape",
        prefixes={"ex": "http://example.org/"},
        selectedPrefix="ex",
        existingShapes=["DepartmentShape"],
    )
    resp = parse_natural_language(req, settings)
    print(f"source={resp.source}  properties={len(resp.properties)}")
    if resp.warnings:
        print("warnings:", resp.warnings)
    print("-" * 70)
    for prop in resp.properties:
        c = prop.constraints.model_dump(by_alias=True, exclude_none=True)
        shown = {k: v for k, v in c.items() if k in INTERESTING}
        print(f"{prop.path:16} {shown}")
    print("-" * 70)

    # Focused checks on the two weak spots.
    by_path = {p.path: p.constraints for p in resp.properties}

    def dump(path: str) -> dict:
        c = by_path.get(path)
        return c.model_dump(by_alias=True, exclude_none=True) if c else {}

    print("startDate  :", dump("startDate"))
    print("endDate    :", dump("endDate"))
    print("teamMembers:", dump("teamMembers"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
