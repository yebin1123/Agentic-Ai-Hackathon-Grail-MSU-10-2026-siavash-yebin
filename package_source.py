"""Build a clean transfer archive without dependencies, local secrets or Git history.

Run: python3 package_source.py /workspace/fin-crypto-research-source.zip
"""
import argparse
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    excluded_dirs = {".git", "node_modules", "dist", ".venv", "venv", "__pycache__",
                     ".pytest_cache", ".idea", ".vscode", ".cache", "playwright-artifacts"}
    excluded_suffixes = {".zip", ".pyc", ".tsbuildinfo", ".log"}
    members = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if not path.is_file() or path.is_symlink():
            continue
        if any(part in excluded_dirs for part in relative.parts):
            continue
        if path.suffix in excluded_suffixes or path.name.startswith(".env"):
            continue
        if path.name in {".DS_Store", "credentials.json"}:
            continue
        members.append((path, relative))
    with ZipFile(args.output, "w", compression=ZIP_DEFLATED) as archive:
        for path, relative in members:
            archive.write(path, arcname=str(Path(root.name) / relative))
    with ZipFile(args.output) as archive:
        assert archive.testzip() is None
        assert any(name.endswith("components/ResearchAnswer.tsx") for name in archive.namelist())
    print(f"Created {args.output.resolve()} with {len(members)} source files.")


if __name__ == "__main__":
    main()
