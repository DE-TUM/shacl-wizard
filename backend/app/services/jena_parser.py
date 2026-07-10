from __future__ import annotations

import os
import re
import subprocess
import tempfile
from typing import Any

from rdflib import Graph

PREFIX_RE = re.compile(
    r"(?:@prefix|PREFIX)\s+([A-Za-z][\w.-]*):\s*<([^>]+)>",
    flags=re.IGNORECASE,
)


def parse_file_with_jena(file_path: str, settings: Any) -> Graph:
    """Parse a TTL file on disk using the external Apache Jena ``TurtleParser``
    Java program.

    Unlike ``parse_ttl_with_jena``, no input temp file is written — the caller
    already has the data on disk so we pass ``file_path`` directly to the Java
    subprocess.  Only the output ``.nt`` temp file is created and cleaned up.
    """
    java_bin = getattr(settings, "jena_java_bin", None)
    class_dir = getattr(settings, "jena_class_dir", None)
    if not java_bin or not class_dir:
        raise RuntimeError("Jena parser requires JENA_JAVA_BIN and JENA_CLASS_DIR.")

    classpath = f"{class_dir}{os.pathsep}{os.path.join(class_dir, 'lib', '*')}"

    tmp_out = tempfile.NamedTemporaryFile(mode="wb", suffix=".nt", delete=False)
    try:
        tmp_out.close()

        with open(tmp_out.name, "wb") as nt_fh:
            proc = subprocess.run(
                [java_bin, "-Xmx6g", "-cp", classpath, "TurtleParser", file_path],
                stdout=nt_fh,
                stderr=subprocess.PIPE,
                timeout=getattr(settings, "jena_request_timeout_seconds", 30.0),
            )

        if proc.returncode != 0:
            stderr_text = proc.stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(
                f"TurtleParser exited with code {proc.returncode}: {stderr_text}"
            )

        graph = Graph()
        graph.parse(tmp_out.name, format="nt")

        # Recover prefix declarations from the first 256 KB of the source file.
        with open(file_path, "rb") as f:
            head = f.read(262_144).decode("utf-8", errors="replace")
        for match in PREFIX_RE.finditer(head):
            try:
                graph.bind(match.group(1), match.group(2))
            except Exception:
                pass

        return graph
    finally:
        try:
            os.unlink(tmp_out.name)
        except OSError:
            pass


def parse_ttl_with_jena(graph_text: str, settings: Any) -> Graph:
    """Parse Turtle text into an RDFLib graph using the external Apache Jena
    ``TurtleParser`` Java program.

    ``TurtleParser.class`` accepts a TTL file path and prints N-Triples to
    stdout. We write the input to a temp TTL file, stream Jena's stdout directly
    to a second temp NT file (never buffering it in Python), then parse the NT
    file by path. Both temp files are always removed in the finally block.
    """
    java_bin = getattr(settings, "jena_java_bin", None)
    class_dir = getattr(settings, "jena_class_dir", None)
    if not java_bin or not class_dir:
        raise RuntimeError("Jena parser requires JENA_JAVA_BIN and JENA_CLASS_DIR.")

    classpath = f"{class_dir}{os.pathsep}{os.path.join(class_dir, 'lib', '*')}"

    tmp_in  = tempfile.NamedTemporaryFile(mode="w",  suffix=".ttl", delete=False, encoding="utf-8")
    tmp_out = tempfile.NamedTemporaryFile(mode="wb",  suffix=".nt",  delete=False)
    try:
        tmp_in.write(graph_text)
        tmp_in.close()
        tmp_out.close()

        # Stream stdout straight to disk — Python never holds N-Triples in memory.
        with open(tmp_out.name, "wb") as nt_fh:
            proc = subprocess.run(
                [java_bin, "-Xmx6g", "-cp", classpath, "TurtleParser", tmp_in.name],
                stdout=nt_fh,
                stderr=subprocess.PIPE,
                timeout=getattr(settings, "jena_request_timeout_seconds", 30.0),
            )

        if proc.returncode != 0:
            stderr_text = proc.stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(
                f"TurtleParser exited with code {proc.returncode}: {stderr_text}"
            )

        graph = Graph()
        graph.parse(tmp_out.name, format="nt")

        # N-Triples carries no prefix declarations. Recover them from the source
        # text so downstream display keeps the original prefixes (parity with the
        # previous Fuseki-based parser).
        for match in PREFIX_RE.finditer(graph_text[:262_144]):
            try:
                graph.bind(match.group(1), match.group(2))
            except Exception:
                pass

        return graph
    finally:
        for path in (tmp_in.name, tmp_out.name):
            try:
                os.unlink(path)
            except OSError:
                pass
