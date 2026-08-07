"""
Imprime la estructura de archivos del proyecto CaseBank, excluyendo
venv, node_modules, .env, .git y otras carpetas/archivos irrelevantes.

Uso:
    python print_structure.py
    python print_structure.py "C:\\Users\\adolf\\OneDrive\\Documents\\manual-casebank"
"""

import os
import sys

EXCLUDE_DIRS = {
    "venv",
    ".venv",
    "env",
    "node_modules",
    ".git",
    "__pycache__",
    ".pytest_cache",
    "dist",
    "build",
    ".vercel",
    ".vite",
    "data",
}

EXCLUDE_FILE_PATTERNS = (
    ".env",
    ".pyc",
    ".pyo",
    ".DS_Store",
)

EXCLUDE_EXACT_FILES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
}


def should_skip_dir(dirname):
    return dirname in EXCLUDE_DIRS or dirname.startswith(".env")


def should_skip_file(filename):
    if filename in EXCLUDE_EXACT_FILES:
        return True
    for pattern in EXCLUDE_FILE_PATTERNS:
        if filename.endswith(pattern):
            return True
    return False


def print_tree(root_path, prefix=""):
    try:
        entries = sorted(os.listdir(root_path))
    except PermissionError:
        return

    dirs = []
    files = []
    for entry in entries:
        full_path = os.path.join(root_path, entry)
        if os.path.isdir(full_path):
            if not should_skip_dir(entry):
                dirs.append(entry)
        else:
            if not should_skip_file(entry):
                files.append(entry)

    all_entries = dirs + files
    total = len(all_entries)

    for i, entry in enumerate(all_entries):
        is_last = i == total - 1
        connector = "\\-- " if is_last else "|-- "
        full_path = os.path.join(root_path, entry)

        print(f"{prefix}{connector}{entry}")

        if os.path.isdir(full_path):
            extension = "    " if is_last else "|   "
            print_tree(full_path, prefix + extension)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    root = os.path.abspath(root)

    if not os.path.isdir(root):
        print(f"Ruta no valida: {root}")
        sys.exit(1)

    print(root)
    print_tree(root)


if __name__ == "__main__":
    main()