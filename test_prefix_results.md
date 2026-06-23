# Prefix & Output Format Test Results
Generated: 2026-06-22 00:30:53

---
## Test 1 — foaf:Person (multi_prefix_test.ttl)

### Detected Prefixes
```json
{
  "dbo": "http://dbpedia.org/ontology/",
  "dc": "http://purl.org/dc/elements/1.1/",
  "foaf": "http://xmlns.com/foaf/0.1/",
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "schema": "http://schema.org/"
}
```

### Validation
- [x] schema: uses http:// not https://
- [x] No schema1: present
- [x] @prefix dbo: declared in Turtle
- [x] @prefix dc: declared in Turtle
- [x] @prefix foaf: declared in Turtle
- [x] @prefix schema: declared in Turtle
- [x] No ex: leak when prefix is foaf:
- [x] JSON-LD parses as valid JSON
- [x] @context includes dbo
- [x] @context includes dc
- [x] @context includes foaf
- [x] @context includes schema
- [x] TriG schema: uses http:// not https://
- [x] @prefix dbo: declared in TriG
- [x] @prefix dc: declared in TriG
- [x] @prefix foaf: declared in TriG
- [x] @prefix schema: declared in TriG
- [x] No ex: leak when prefix is foaf:
- [x] RDF/XML is non-empty and looks valid

### Turtle Output
```turtle
@prefix dbo: <http://dbpedia.org/ontology/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

foaf:PersonShape a sh:NodeShape ;
    sh:property [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:jobTitle ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dc:description ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path foaf:name ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dbo:birthPlace ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:IRI ;
            sh:path schema:worksFor ],
        [ a sh:PropertyShape ;
            sh:datatype xsd:integer ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path foaf:age ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path foaf:mbox ] ;
    sh:targetClass foaf:Person .


```

### JSON-LD Output
```json
{
  "@context": {
    "dbo": "http://dbpedia.org/ontology/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "schema": "http://schema.org/",
    "sh": "http://www.w3.org/ns/shacl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@graph": [
    {
      "@id": "foaf:PersonShape",
      "@type": "sh:NodeShape",
      "sh:property": [
        {
          "@id": "_:Na1e66efd475c445da5e2ca268d39f840"
        },
        {
          "@id": "_:N36708036fd8c4bec8b967b828c75f099"
        },
        {
          "@id": "_:Ned550d27d3704a7588180788db03c8b5"
        },
        {
          "@id": "_:Nf1e1959390ab4753a30129e58f38b88c"
        },
        {
          "@id": "_:N62684a041a2c43fb8f15ed79e7726394"
        },
        {
          "@id": "_:N07c642b03426427eb112e01b153a2e3d"
        },
        {
          "@id": "_:Nc1944e31fdf04d20809a3b3a5ee50515"
        }
      ],
      "sh:targetClass": {
        "@id": "foaf:Person"
      }
    },
    {
      "@id": "_:Na1e66efd475c445da5e2ca268d39f840",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dbo:birthPlace"
      }
    },
    {
      "@id": "_:N36708036fd8c4bec8b967b828c75f099",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dc:description"
      }
    },
    {
      "@id": "_:Ned550d27d3704a7588180788db03c8b5",
      "@type": "sh:PropertyShape",
      "sh:datatype": {
        "@id": "xsd:integer"
      },
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "foaf:age"
      }
    },
    {
      "@id": "_:Nf1e1959390ab4753a30129e58f38b88c",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "foaf:mbox"
      }
    },
    {
      "@id": "_:N62684a041a2c43fb8f15ed79e7726394",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "foaf:name"
      }
    },
    {
      "@id": "_:N07c642b03426427eb112e01b153a2e3d",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:jobTitle"
      }
    },
    {
      "@id": "_:Nc1944e31fdf04d20809a3b3a5ee50515",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "schema:worksFor"
      }
    }
  ]
}
```

### RDF/XML Output
```xml
<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:sh="http://www.w3.org/ns/shacl#"
>
  <rdf:Description rdf:nodeID="N62684a041a2c43fb8f15ed79e7726394">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://xmlns.com/foaf/0.1/name"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:about="http://xmlns.com/foaf/0.1/PersonShape">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#NodeShape"/>
    <sh:targetClass rdf:resource="http://xmlns.com/foaf/0.1/Person"/>
    <sh:property rdf:nodeID="Na1e66efd475c445da5e2ca268d39f840"/>
    <sh:property rdf:nodeID="N36708036fd8c4bec8b967b828c75f099"/>
    <sh:property rdf:nodeID="Ned550d27d3704a7588180788db03c8b5"/>
    <sh:property rdf:nodeID="Nf1e1959390ab4753a30129e58f38b88c"/>
    <sh:property rdf:nodeID="N62684a041a2c43fb8f15ed79e7726394"/>
    <sh:property rdf:nodeID="N07c642b03426427eb112e01b153a2e3d"/>
    <sh:property rdf:nodeID="Nc1944e31fdf04d20809a3b3a5ee50515"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N07c642b03426427eb112e01b153a2e3d">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/jobTitle"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Ned550d27d3704a7588180788db03c8b5">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://xmlns.com/foaf/0.1/age"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#integer"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N36708036fd8c4bec8b967b828c75f099">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://purl.org/dc/elements/1.1/description"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nf1e1959390ab4753a30129e58f38b88c">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://xmlns.com/foaf/0.1/mbox"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Na1e66efd475c445da5e2ca268d39f840">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://dbpedia.org/ontology/birthPlace"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nc1944e31fdf04d20809a3b3a5ee50515">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/worksFor"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
  </rdf:Description>
</rdf:RDF>

```

### TriG Output
```trig
@prefix dbo: <http://dbpedia.org/ontology/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

foaf:ShapesGraph {
    foaf:PersonShape a sh:NodeShape ;
        sh:property _:N07c642b03426427eb112e01b153a2e3d,
            _:N36708036fd8c4bec8b967b828c75f099,
            _:N62684a041a2c43fb8f15ed79e7726394,
            _:Na1e66efd475c445da5e2ca268d39f840,
            _:Nc1944e31fdf04d20809a3b3a5ee50515,
            _:Ned550d27d3704a7588180788db03c8b5,
            _:Nf1e1959390ab4753a30129e58f38b88c ;
        sh:targetClass foaf:Person .

    _:N07c642b03426427eb112e01b153a2e3d a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:jobTitle .

    _:N36708036fd8c4bec8b967b828c75f099 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dc:description .

    _:N62684a041a2c43fb8f15ed79e7726394 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path foaf:name .

    _:Na1e66efd475c445da5e2ca268d39f840 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dbo:birthPlace .

    _:Nc1944e31fdf04d20809a3b3a5ee50515 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:IRI ;
        sh:path schema:worksFor .

    _:Ned550d27d3704a7588180788db03c8b5 a sh:PropertyShape ;
        sh:datatype xsd:integer ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path foaf:age .

    _:Nf1e1959390ab4753a30129e58f38b88c a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path foaf:mbox .
}


```

---

## Test 2 — schema:Organization (multi_prefix_test.ttl)

### Detected Prefixes
```json
{
  "dbo": "http://dbpedia.org/ontology/",
  "dc": "http://purl.org/dc/elements/1.1/",
  "foaf": "http://xmlns.com/foaf/0.1/",
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "schema": "http://schema.org/"
}
```

### Validation
- [x] schema: uses http:// not https://
- [x] No schema1: present
- [x] @prefix dbo: declared in Turtle
- [x] @prefix dc: declared in Turtle
- [ ] @prefix foaf: declared in Turtle  
  > FAIL: prefix block missing
- [x] @prefix schema: declared in Turtle
- [x] No ex: leak when prefix is schema:
- [x] JSON-LD parses as valid JSON
- [x] @context includes dbo
- [x] @context includes dc
- [x] @context includes foaf
- [x] @context includes schema
- [x] TriG schema: uses http:// not https://
- [x] @prefix dbo: declared in TriG
- [x] @prefix dc: declared in TriG
- [ ] @prefix foaf: declared in TriG  
  > FAIL: prefix block missing
- [x] @prefix schema: declared in TriG
- [x] No ex: leak when prefix is schema:
- [x] RDF/XML is non-empty and looks valid
- [x] No schema1: anywhere in Turtle

### Turtle Output
```turtle
@prefix dbo: <http://dbpedia.org/ontology/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix schema: <http://schema.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

schema:OrganizationShape a sh:NodeShape ;
    sh:property [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dbo:locationCity ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dc:subject ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:url ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:name ],
        [ a sh:PropertyShape ;
            sh:datatype xsd:integer ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:numberOfEmployees ],
        [ a sh:PropertyShape ;
            sh:datatype xsd:date ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:foundingDate ] ;
    sh:targetClass schema:Organization .


```

### JSON-LD Output
```json
{
  "@context": {
    "dbo": "http://dbpedia.org/ontology/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "schema": "http://schema.org/",
    "sh": "http://www.w3.org/ns/shacl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@graph": [
    {
      "@id": "schema:OrganizationShape",
      "@type": "sh:NodeShape",
      "sh:property": [
        {
          "@id": "_:N3bf44499752d4ae8910bac0ff750d46f"
        },
        {
          "@id": "_:N5dd3fb57cf704baa9d03167d8d6d8af9"
        },
        {
          "@id": "_:Nf8e95a0af6b54eee91e8e96bf280626b"
        },
        {
          "@id": "_:Nb07798bd5b524e78a0e099b92aa021be"
        },
        {
          "@id": "_:Nc8534eab1fd14b6eb3972009ef8cd988"
        },
        {
          "@id": "_:N8b384a46aa8c46a49f837562514aaa45"
        }
      ],
      "sh:targetClass": {
        "@id": "schema:Organization"
      }
    },
    {
      "@id": "_:N3bf44499752d4ae8910bac0ff750d46f",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dbo:locationCity"
      }
    },
    {
      "@id": "_:N5dd3fb57cf704baa9d03167d8d6d8af9",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dc:subject"
      }
    },
    {
      "@id": "_:Nf8e95a0af6b54eee91e8e96bf280626b",
      "@type": "sh:PropertyShape",
      "sh:datatype": {
        "@id": "xsd:date"
      },
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:foundingDate"
      }
    },
    {
      "@id": "_:Nb07798bd5b524e78a0e099b92aa021be",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:name"
      }
    },
    {
      "@id": "_:Nc8534eab1fd14b6eb3972009ef8cd988",
      "@type": "sh:PropertyShape",
      "sh:datatype": {
        "@id": "xsd:integer"
      },
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:numberOfEmployees"
      }
    },
    {
      "@id": "_:N8b384a46aa8c46a49f837562514aaa45",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:url"
      }
    }
  ]
}
```

### RDF/XML Output
```xml
<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:sh="http://www.w3.org/ns/shacl#"
>
  <rdf:Description rdf:nodeID="Nb07798bd5b524e78a0e099b92aa021be">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/name"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:about="http://schema.org/OrganizationShape">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#NodeShape"/>
    <sh:targetClass rdf:resource="http://schema.org/Organization"/>
    <sh:property rdf:nodeID="N3bf44499752d4ae8910bac0ff750d46f"/>
    <sh:property rdf:nodeID="N5dd3fb57cf704baa9d03167d8d6d8af9"/>
    <sh:property rdf:nodeID="Nf8e95a0af6b54eee91e8e96bf280626b"/>
    <sh:property rdf:nodeID="Nb07798bd5b524e78a0e099b92aa021be"/>
    <sh:property rdf:nodeID="Nc8534eab1fd14b6eb3972009ef8cd988"/>
    <sh:property rdf:nodeID="N8b384a46aa8c46a49f837562514aaa45"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nf8e95a0af6b54eee91e8e96bf280626b">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/foundingDate"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#date"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N3bf44499752d4ae8910bac0ff750d46f">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://dbpedia.org/ontology/locationCity"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N5dd3fb57cf704baa9d03167d8d6d8af9">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://purl.org/dc/elements/1.1/subject"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nc8534eab1fd14b6eb3972009ef8cd988">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/numberOfEmployees"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#integer"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N8b384a46aa8c46a49f837562514aaa45">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/url"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
</rdf:RDF>

```

### TriG Output
```trig
@prefix dbo: <http://dbpedia.org/ontology/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix schema: <http://schema.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

schema:ShapesGraph {
    schema:OrganizationShape a sh:NodeShape ;
        sh:property _:N3bf44499752d4ae8910bac0ff750d46f,
            _:N5dd3fb57cf704baa9d03167d8d6d8af9,
            _:N8b384a46aa8c46a49f837562514aaa45,
            _:Nb07798bd5b524e78a0e099b92aa021be,
            _:Nc8534eab1fd14b6eb3972009ef8cd988,
            _:Nf8e95a0af6b54eee91e8e96bf280626b ;
        sh:targetClass schema:Organization .

    _:N3bf44499752d4ae8910bac0ff750d46f a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dbo:locationCity .

    _:N5dd3fb57cf704baa9d03167d8d6d8af9 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dc:subject .

    _:N8b384a46aa8c46a49f837562514aaa45 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:url .

    _:Nb07798bd5b524e78a0e099b92aa021be a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:name .

    _:Nc8534eab1fd14b6eb3972009ef8cd988 a sh:PropertyShape ;
        sh:datatype xsd:integer ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:numberOfEmployees .

    _:Nf8e95a0af6b54eee91e8e96bf280626b a sh:PropertyShape ;
        sh:datatype xsd:date ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:foundingDate .
}


```

---

## Test 3 — ub:FullProfessor (lubm-skg-1.ttl)

### Detected Prefixes
```json
{
  "owl": "http://www.w3.org/2002/07/owl#",
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "ub": "http://swat.cse.lehigh.edu/onto/univ-bench.owl#"
}
```

### Validation
- [x] No schema1: present
- [x] @prefix ub: declared in Turtle
- [x] No ex: leak when prefix is ub:
- [x] JSON-LD parses as valid JSON
- [x] @context includes ub
- [x] @prefix ub: declared in TriG
- [x] No ex: leak when prefix is ub:
- [x] RDF/XML is non-empty and looks valid
- [x] ub: prefix throughout (zero ex: occurrences in ub: context)

### Turtle Output
```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ub: <http://swat.cse.lehigh.edu/onto/univ-bench.owl#> .

ub:FullProfessorShape a sh:NodeShape ;
    sh:property [ a sh:PropertyShape ;
            sh:nodeKind sh:IRI ;
            sh:path ub:undergraduateDegreeFrom ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:Literal ;
            sh:path ub:telephone ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:IRI ;
            sh:path ub:teacherOf ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:IRI ;
            sh:path ub:headOf ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:Literal ;
            sh:path ub:name ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:Literal ;
            sh:path ub:emailAddress ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:IRI ;
            sh:path ub:mastersDegreeFrom ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:Literal ;
            sh:path ub:researchInterest ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:IRI ;
            sh:path ub:doctoralDegreeFrom ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:IRI ;
            sh:path ub:worksFor ] ;
    sh:targetClass ub:FullProfessor .


```

### JSON-LD Output
```json
{
  "@context": {
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "sh": "http://www.w3.org/ns/shacl#",
    "ub": "http://swat.cse.lehigh.edu/onto/univ-bench.owl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@graph": [
    {
      "@id": "ub:FullProfessorShape",
      "@type": "sh:NodeShape",
      "sh:property": [
        {
          "@id": "_:Nd75597e231774fcb8a48e05fd35a3952"
        },
        {
          "@id": "_:N9cff8232666c4694a28671ff0c14076c"
        },
        {
          "@id": "_:N97e0f238ae3544a7a9bba2baded8d884"
        },
        {
          "@id": "_:Nab6ef225a8c24d07b687a6ba2bc22377"
        },
        {
          "@id": "_:N9bdd922b5a56472ea381344701804086"
        },
        {
          "@id": "_:Nd5b569adb3da43a98868d252577e6eec"
        },
        {
          "@id": "_:N75e8ecba90494622b1800962d3d54e69"
        },
        {
          "@id": "_:N6555ebe07b4f44cba7eb09423c9ec676"
        },
        {
          "@id": "_:N2ed228c5d9274609b53190c4eb968574"
        },
        {
          "@id": "_:Nefe54468c18e4ad09dc7f30734c2021c"
        }
      ],
      "sh:targetClass": {
        "@id": "ub:FullProfessor"
      }
    },
    {
      "@id": "_:Nd75597e231774fcb8a48e05fd35a3952",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "ub:doctoralDegreeFrom"
      }
    },
    {
      "@id": "_:N9cff8232666c4694a28671ff0c14076c",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "ub:emailAddress"
      }
    },
    {
      "@id": "_:N97e0f238ae3544a7a9bba2baded8d884",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "ub:headOf"
      }
    },
    {
      "@id": "_:Nab6ef225a8c24d07b687a6ba2bc22377",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "ub:mastersDegreeFrom"
      }
    },
    {
      "@id": "_:N9bdd922b5a56472ea381344701804086",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "ub:name"
      }
    },
    {
      "@id": "_:Nd5b569adb3da43a98868d252577e6eec",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "ub:researchInterest"
      }
    },
    {
      "@id": "_:N75e8ecba90494622b1800962d3d54e69",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "ub:teacherOf"
      }
    },
    {
      "@id": "_:N6555ebe07b4f44cba7eb09423c9ec676",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "ub:telephone"
      }
    },
    {
      "@id": "_:N2ed228c5d9274609b53190c4eb968574",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "ub:undergraduateDegreeFrom"
      }
    },
    {
      "@id": "_:Nefe54468c18e4ad09dc7f30734c2021c",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "ub:worksFor"
      }
    }
  ]
}
```

### RDF/XML Output
```xml
<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:sh="http://www.w3.org/ns/shacl#"
>
  <rdf:Description rdf:nodeID="N6555ebe07b4f44cba7eb09423c9ec676">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#telephone"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:about="http://swat.cse.lehigh.edu/onto/univ-bench.owl#FullProfessorShape">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#NodeShape"/>
    <sh:targetClass rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#FullProfessor"/>
    <sh:property rdf:nodeID="Nd75597e231774fcb8a48e05fd35a3952"/>
    <sh:property rdf:nodeID="N9cff8232666c4694a28671ff0c14076c"/>
    <sh:property rdf:nodeID="N97e0f238ae3544a7a9bba2baded8d884"/>
    <sh:property rdf:nodeID="Nab6ef225a8c24d07b687a6ba2bc22377"/>
    <sh:property rdf:nodeID="N9bdd922b5a56472ea381344701804086"/>
    <sh:property rdf:nodeID="Nd5b569adb3da43a98868d252577e6eec"/>
    <sh:property rdf:nodeID="N75e8ecba90494622b1800962d3d54e69"/>
    <sh:property rdf:nodeID="N6555ebe07b4f44cba7eb09423c9ec676"/>
    <sh:property rdf:nodeID="N2ed228c5d9274609b53190c4eb968574"/>
    <sh:property rdf:nodeID="Nefe54468c18e4ad09dc7f30734c2021c"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N9bdd922b5a56472ea381344701804086">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#name"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nd75597e231774fcb8a48e05fd35a3952">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#doctoralDegreeFrom"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nd5b569adb3da43a98868d252577e6eec">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#researchInterest"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nefe54468c18e4ad09dc7f30734c2021c">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#worksFor"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N97e0f238ae3544a7a9bba2baded8d884">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#headOf"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N9cff8232666c4694a28671ff0c14076c">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#emailAddress"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N2ed228c5d9274609b53190c4eb968574">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#undergraduateDegreeFrom"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nab6ef225a8c24d07b687a6ba2bc22377">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#mastersDegreeFrom"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N75e8ecba90494622b1800962d3d54e69">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://swat.cse.lehigh.edu/onto/univ-bench.owl#teacherOf"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
  </rdf:Description>
</rdf:RDF>

```

### TriG Output
```trig
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix ub: <http://swat.cse.lehigh.edu/onto/univ-bench.owl#> .

ub:ShapesGraph {
    ub:FullProfessorShape a sh:NodeShape ;
        sh:property _:N2ed228c5d9274609b53190c4eb968574,
            _:N6555ebe07b4f44cba7eb09423c9ec676,
            _:N75e8ecba90494622b1800962d3d54e69,
            _:N97e0f238ae3544a7a9bba2baded8d884,
            _:N9bdd922b5a56472ea381344701804086,
            _:N9cff8232666c4694a28671ff0c14076c,
            _:Nab6ef225a8c24d07b687a6ba2bc22377,
            _:Nd5b569adb3da43a98868d252577e6eec,
            _:Nd75597e231774fcb8a48e05fd35a3952,
            _:Nefe54468c18e4ad09dc7f30734c2021c ;
        sh:targetClass ub:FullProfessor .

    _:N2ed228c5d9274609b53190c4eb968574 a sh:PropertyShape ;
        sh:nodeKind sh:IRI ;
        sh:path ub:undergraduateDegreeFrom .

    _:N6555ebe07b4f44cba7eb09423c9ec676 a sh:PropertyShape ;
        sh:nodeKind sh:Literal ;
        sh:path ub:telephone .

    _:N75e8ecba90494622b1800962d3d54e69 a sh:PropertyShape ;
        sh:nodeKind sh:IRI ;
        sh:path ub:teacherOf .

    _:N97e0f238ae3544a7a9bba2baded8d884 a sh:PropertyShape ;
        sh:nodeKind sh:IRI ;
        sh:path ub:headOf .

    _:N9bdd922b5a56472ea381344701804086 a sh:PropertyShape ;
        sh:nodeKind sh:Literal ;
        sh:path ub:name .

    _:N9cff8232666c4694a28671ff0c14076c a sh:PropertyShape ;
        sh:nodeKind sh:Literal ;
        sh:path ub:emailAddress .

    _:Nab6ef225a8c24d07b687a6ba2bc22377 a sh:PropertyShape ;
        sh:nodeKind sh:IRI ;
        sh:path ub:mastersDegreeFrom .

    _:Nd5b569adb3da43a98868d252577e6eec a sh:PropertyShape ;
        sh:nodeKind sh:Literal ;
        sh:path ub:researchInterest .

    _:Nd75597e231774fcb8a48e05fd35a3952 a sh:PropertyShape ;
        sh:nodeKind sh:IRI ;
        sh:path ub:doctoralDegreeFrom .

    _:Nefe54468c18e4ad09dc7f30734c2021c a sh:PropertyShape ;
        sh:nodeKind sh:IRI ;
        sh:path ub:worksFor .
}


```

---

## Test 4 — Manual mode, myns: prefix

### Detected Prefixes
```json
{}
```

### Validation
- [x] No schema1: present
- [x] @prefix myns: declared in Turtle
- [x] No ex: leak when prefix is myns:
- [x] JSON-LD parses as valid JSON
- [x] @context includes myns
- [x] @prefix myns: declared in TriG
- [x] No ex: leak when prefix is myns:
- [x] RDF/XML is non-empty and looks valid
- [x] myns:name / myns:age / myns:email appear in Turtle

### Turtle Output
```turtle
@prefix myns: <http://mynamespace.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

myns:PersonShape a sh:NodeShape ;
    sh:property [ a sh:PropertyShape ;
            sh:nodeKind sh:Literal ;
            sh:path myns:email ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:Literal ;
            sh:path myns:age ],
        [ a sh:PropertyShape ;
            sh:nodeKind sh:Literal ;
            sh:path myns:name ] ;
    sh:targetClass myns:Person .


```

### JSON-LD Output
```json
{
  "@context": {
    "myns": "http://mynamespace.org/",
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "sh": "http://www.w3.org/ns/shacl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@graph": [
    {
      "@id": "myns:PersonShape",
      "@type": "sh:NodeShape",
      "sh:property": [
        {
          "@id": "_:N9c8b6a96013b43939c0dc2b14f7931ea"
        },
        {
          "@id": "_:N7530fc4e8f5a45c7ba1e147dc6c7548b"
        },
        {
          "@id": "_:N3084a50c9bae492eacfa738bf07a26ed"
        }
      ],
      "sh:targetClass": {
        "@id": "myns:Person"
      }
    },
    {
      "@id": "_:N9c8b6a96013b43939c0dc2b14f7931ea",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "myns:name"
      }
    },
    {
      "@id": "_:N7530fc4e8f5a45c7ba1e147dc6c7548b",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "myns:age"
      }
    },
    {
      "@id": "_:N3084a50c9bae492eacfa738bf07a26ed",
      "@type": "sh:PropertyShape",
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "myns:email"
      }
    }
  ]
}
```

### RDF/XML Output
```xml
<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:sh="http://www.w3.org/ns/shacl#"
>
  <rdf:Description rdf:nodeID="N9c8b6a96013b43939c0dc2b14f7931ea">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://mynamespace.org/name"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N7530fc4e8f5a45c7ba1e147dc6c7548b">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://mynamespace.org/age"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:about="http://mynamespace.org/PersonShape">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#NodeShape"/>
    <sh:targetClass rdf:resource="http://mynamespace.org/Person"/>
    <sh:property rdf:nodeID="N9c8b6a96013b43939c0dc2b14f7931ea"/>
    <sh:property rdf:nodeID="N7530fc4e8f5a45c7ba1e147dc6c7548b"/>
    <sh:property rdf:nodeID="N3084a50c9bae492eacfa738bf07a26ed"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N3084a50c9bae492eacfa738bf07a26ed">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://mynamespace.org/email"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
</rdf:RDF>

```

### TriG Output
```trig
@prefix myns: <http://mynamespace.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .

myns:ShapesGraph {
    myns:PersonShape a sh:NodeShape ;
        sh:property _:N3084a50c9bae492eacfa738bf07a26ed,
            _:N7530fc4e8f5a45c7ba1e147dc6c7548b,
            _:N9c8b6a96013b43939c0dc2b14f7931ea ;
        sh:targetClass myns:Person .

    _:N3084a50c9bae492eacfa738bf07a26ed a sh:PropertyShape ;
        sh:nodeKind sh:Literal ;
        sh:path myns:email .

    _:N7530fc4e8f5a45c7ba1e147dc6c7548b a sh:PropertyShape ;
        sh:nodeKind sh:Literal ;
        sh:path myns:age .

    _:N9c8b6a96013b43939c0dc2b14f7931ea a sh:PropertyShape ;
        sh:nodeKind sh:Literal ;
        sh:path myns:name .
}


```

---

## Test 5 — Two shapes with sh:node cross-reference (multi_prefix_test.ttl)

### Detected Prefixes
```json
{
  "dbo": "http://dbpedia.org/ontology/",
  "dc": "http://purl.org/dc/elements/1.1/",
  "foaf": "http://xmlns.com/foaf/0.1/",
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "schema": "http://schema.org/"
}
```

### Validation
- [x] schema: uses http:// not https://
- [x] No schema1: present
- [x] @prefix dbo: declared in Turtle
- [x] @prefix dc: declared in Turtle
- [x] @prefix foaf: declared in Turtle
- [x] @prefix schema: declared in Turtle
- [x] No ex: leak when prefix is foaf:
- [x] JSON-LD parses as valid JSON
- [x] @context includes dbo
- [x] @context includes dc
- [x] @context includes foaf
- [x] @context includes schema
- [x] TriG schema: uses http:// not https://
- [x] @prefix dbo: declared in TriG
- [x] @prefix dc: declared in TriG
- [x] @prefix foaf: declared in TriG
- [x] @prefix schema: declared in TriG
- [x] No ex: leak when prefix is foaf:
- [x] RDF/XML is non-empty and looks valid
- [x] Turtle contains sh:node foaf:OrganizationShape cross-reference
- [x] Both PersonShape and OrganizationShape present in Turtle

### Turtle Output
```turtle
@prefix dbo: <http://dbpedia.org/ontology/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

foaf:PersonShape a sh:NodeShape ;
    sh:property [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path foaf:mbox ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:jobTitle ],
        [ a sh:PropertyShape ;
            sh:datatype xsd:integer ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path foaf:age ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path foaf:name ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:node foaf:OrganizationShape ;
            sh:nodeKind sh:IRI ;
            sh:path schema:worksFor ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dc:description ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dbo:birthPlace ] ;
    sh:targetClass foaf:Person .

foaf:OrganizationShape a sh:NodeShape ;
    sh:property [ a sh:PropertyShape ;
            sh:datatype xsd:date ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:foundingDate ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dbo:locationCity ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:url ],
        [ a sh:PropertyShape ;
            sh:datatype xsd:integer ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:numberOfEmployees ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path dc:subject ],
        [ a sh:PropertyShape ;
            sh:maxCount 1 ;
            sh:nodeKind sh:Literal ;
            sh:path schema:name ] ;
    sh:targetClass foaf:Organization .


```

### JSON-LD Output
```json
{
  "@context": {
    "dbo": "http://dbpedia.org/ontology/",
    "dc": "http://purl.org/dc/elements/1.1/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "schema": "http://schema.org/",
    "sh": "http://www.w3.org/ns/shacl#",
    "xsd": "http://www.w3.org/2001/XMLSchema#"
  },
  "@graph": [
    {
      "@id": "foaf:OrganizationShape",
      "@type": "sh:NodeShape",
      "sh:property": [
        {
          "@id": "_:N56dc6527d0834f94b5e4757af04cba7f"
        },
        {
          "@id": "_:N9528f9b1a82f4710904a5e5242050189"
        },
        {
          "@id": "_:N2811b50ae86646f7bf4b99b8671fdd0b"
        },
        {
          "@id": "_:Na6821d764fcb43e284e12e56ba1cd6e9"
        },
        {
          "@id": "_:N7d4a92a0c0cd4873a3349e727a520167"
        },
        {
          "@id": "_:N6cec878a3e1d408abc17c1a3d7a747e6"
        }
      ],
      "sh:targetClass": {
        "@id": "foaf:Organization"
      }
    },
    {
      "@id": "_:N56dc6527d0834f94b5e4757af04cba7f",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dbo:locationCity"
      }
    },
    {
      "@id": "_:N9528f9b1a82f4710904a5e5242050189",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dc:subject"
      }
    },
    {
      "@id": "_:N2811b50ae86646f7bf4b99b8671fdd0b",
      "@type": "sh:PropertyShape",
      "sh:datatype": {
        "@id": "xsd:date"
      },
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:foundingDate"
      }
    },
    {
      "@id": "_:Na6821d764fcb43e284e12e56ba1cd6e9",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:name"
      }
    },
    {
      "@id": "_:N7d4a92a0c0cd4873a3349e727a520167",
      "@type": "sh:PropertyShape",
      "sh:datatype": {
        "@id": "xsd:integer"
      },
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:numberOfEmployees"
      }
    },
    {
      "@id": "_:N6cec878a3e1d408abc17c1a3d7a747e6",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:url"
      }
    },
    {
      "@id": "foaf:PersonShape",
      "@type": "sh:NodeShape",
      "sh:property": [
        {
          "@id": "_:Nb8e8c950de4640c68c3fc493ab83a9a6"
        },
        {
          "@id": "_:N94032965ecbd4f2c9c7becd91be33a53"
        },
        {
          "@id": "_:N6c42b6904a254e69b287578203773e2c"
        },
        {
          "@id": "_:N23cbe784417d430f8c0ba458656b0c7a"
        },
        {
          "@id": "_:N7401e29566894cd4a85a4bb66a1b8e7b"
        },
        {
          "@id": "_:N6242426a133849a399116e43fc9621ff"
        },
        {
          "@id": "_:N877299b5dfce49ea921c97f162f3537e"
        }
      ],
      "sh:targetClass": {
        "@id": "foaf:Person"
      }
    },
    {
      "@id": "_:Nb8e8c950de4640c68c3fc493ab83a9a6",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dbo:birthPlace"
      }
    },
    {
      "@id": "_:N94032965ecbd4f2c9c7becd91be33a53",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "dc:description"
      }
    },
    {
      "@id": "_:N6c42b6904a254e69b287578203773e2c",
      "@type": "sh:PropertyShape",
      "sh:datatype": {
        "@id": "xsd:integer"
      },
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "foaf:age"
      }
    },
    {
      "@id": "_:N23cbe784417d430f8c0ba458656b0c7a",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "foaf:mbox"
      }
    },
    {
      "@id": "_:N7401e29566894cd4a85a4bb66a1b8e7b",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "foaf:name"
      }
    },
    {
      "@id": "_:N6242426a133849a399116e43fc9621ff",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:nodeKind": {
        "@id": "sh:Literal"
      },
      "sh:path": {
        "@id": "schema:jobTitle"
      }
    },
    {
      "@id": "_:N877299b5dfce49ea921c97f162f3537e",
      "@type": "sh:PropertyShape",
      "sh:maxCount": 1,
      "sh:node": {
        "@id": "foaf:OrganizationShape"
      },
      "sh:nodeKind": {
        "@id": "sh:IRI"
      },
      "sh:path": {
        "@id": "schema:worksFor"
      }
    }
  ]
}
```

### RDF/XML Output
```xml
<?xml version="1.0" encoding="utf-8"?>
<rdf:RDF
   xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
   xmlns:sh="http://www.w3.org/ns/shacl#"
>
  <rdf:Description rdf:nodeID="N7d4a92a0c0cd4873a3349e727a520167">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/numberOfEmployees"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#integer"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Na6821d764fcb43e284e12e56ba1cd6e9">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/name"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N6c42b6904a254e69b287578203773e2c">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://xmlns.com/foaf/0.1/age"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#integer"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:about="http://xmlns.com/foaf/0.1/OrganizationShape">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#NodeShape"/>
    <sh:targetClass rdf:resource="http://xmlns.com/foaf/0.1/Organization"/>
    <sh:property rdf:nodeID="N56dc6527d0834f94b5e4757af04cba7f"/>
    <sh:property rdf:nodeID="N9528f9b1a82f4710904a5e5242050189"/>
    <sh:property rdf:nodeID="N2811b50ae86646f7bf4b99b8671fdd0b"/>
    <sh:property rdf:nodeID="Na6821d764fcb43e284e12e56ba1cd6e9"/>
    <sh:property rdf:nodeID="N7d4a92a0c0cd4873a3349e727a520167"/>
    <sh:property rdf:nodeID="N6cec878a3e1d408abc17c1a3d7a747e6"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N2811b50ae86646f7bf4b99b8671fdd0b">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/foundingDate"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:datatype rdf:resource="http://www.w3.org/2001/XMLSchema#date"/>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N7401e29566894cd4a85a4bb66a1b8e7b">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://xmlns.com/foaf/0.1/name"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N6cec878a3e1d408abc17c1a3d7a747e6">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/url"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N94032965ecbd4f2c9c7becd91be33a53">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://purl.org/dc/elements/1.1/description"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="Nb8e8c950de4640c68c3fc493ab83a9a6">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://dbpedia.org/ontology/birthPlace"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N877299b5dfce49ea921c97f162f3537e">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/worksFor"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#IRI"/>
    <sh:node rdf:resource="http://xmlns.com/foaf/0.1/OrganizationShape"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N6242426a133849a399116e43fc9621ff">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://schema.org/jobTitle"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N23cbe784417d430f8c0ba458656b0c7a">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://xmlns.com/foaf/0.1/mbox"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N9528f9b1a82f4710904a5e5242050189">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://purl.org/dc/elements/1.1/subject"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
  <rdf:Description rdf:about="http://xmlns.com/foaf/0.1/PersonShape">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#NodeShape"/>
    <sh:targetClass rdf:resource="http://xmlns.com/foaf/0.1/Person"/>
    <sh:property rdf:nodeID="Nb8e8c950de4640c68c3fc493ab83a9a6"/>
    <sh:property rdf:nodeID="N94032965ecbd4f2c9c7becd91be33a53"/>
    <sh:property rdf:nodeID="N6c42b6904a254e69b287578203773e2c"/>
    <sh:property rdf:nodeID="N23cbe784417d430f8c0ba458656b0c7a"/>
    <sh:property rdf:nodeID="N7401e29566894cd4a85a4bb66a1b8e7b"/>
    <sh:property rdf:nodeID="N6242426a133849a399116e43fc9621ff"/>
    <sh:property rdf:nodeID="N877299b5dfce49ea921c97f162f3537e"/>
  </rdf:Description>
  <rdf:Description rdf:nodeID="N56dc6527d0834f94b5e4757af04cba7f">
    <rdf:type rdf:resource="http://www.w3.org/ns/shacl#PropertyShape"/>
    <sh:path rdf:resource="http://dbpedia.org/ontology/locationCity"/>
    <sh:maxCount rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">1</sh:maxCount>
    <sh:nodeKind rdf:resource="http://www.w3.org/ns/shacl#Literal"/>
  </rdf:Description>
</rdf:RDF>

```

### TriG Output
```trig
@prefix dbo: <http://dbpedia.org/ontology/> .
@prefix dc: <http://purl.org/dc/elements/1.1/> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

foaf:ShapesGraph {
    foaf:PersonShape a sh:NodeShape ;
        sh:property _:N23cbe784417d430f8c0ba458656b0c7a,
            _:N6242426a133849a399116e43fc9621ff,
            _:N6c42b6904a254e69b287578203773e2c,
            _:N7401e29566894cd4a85a4bb66a1b8e7b,
            _:N877299b5dfce49ea921c97f162f3537e,
            _:N94032965ecbd4f2c9c7becd91be33a53,
            _:Nb8e8c950de4640c68c3fc493ab83a9a6 ;
        sh:targetClass foaf:Person .

    foaf:OrganizationShape a sh:NodeShape ;
        sh:property _:N2811b50ae86646f7bf4b99b8671fdd0b,
            _:N56dc6527d0834f94b5e4757af04cba7f,
            _:N6cec878a3e1d408abc17c1a3d7a747e6,
            _:N7d4a92a0c0cd4873a3349e727a520167,
            _:N9528f9b1a82f4710904a5e5242050189,
            _:Na6821d764fcb43e284e12e56ba1cd6e9 ;
        sh:targetClass foaf:Organization .

    _:N23cbe784417d430f8c0ba458656b0c7a a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path foaf:mbox .

    _:N2811b50ae86646f7bf4b99b8671fdd0b a sh:PropertyShape ;
        sh:datatype xsd:date ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:foundingDate .

    _:N56dc6527d0834f94b5e4757af04cba7f a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dbo:locationCity .

    _:N6242426a133849a399116e43fc9621ff a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:jobTitle .

    _:N6c42b6904a254e69b287578203773e2c a sh:PropertyShape ;
        sh:datatype xsd:integer ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path foaf:age .

    _:N6cec878a3e1d408abc17c1a3d7a747e6 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:url .

    _:N7401e29566894cd4a85a4bb66a1b8e7b a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path foaf:name .

    _:N7d4a92a0c0cd4873a3349e727a520167 a sh:PropertyShape ;
        sh:datatype xsd:integer ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:numberOfEmployees .

    _:N877299b5dfce49ea921c97f162f3537e a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:node foaf:OrganizationShape ;
        sh:nodeKind sh:IRI ;
        sh:path schema:worksFor .

    _:N94032965ecbd4f2c9c7becd91be33a53 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dc:description .

    _:N9528f9b1a82f4710904a5e5242050189 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dc:subject .

    _:Na6821d764fcb43e284e12e56ba1cd6e9 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path schema:name .

    _:Nb8e8c950de4640c68c3fc493ab83a9a6 a sh:PropertyShape ;
        sh:maxCount 1 ;
        sh:nodeKind sh:Literal ;
        sh:path dbo:birthPlace .
}


```

---
