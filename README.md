# Codeforces Group Contest Tracker

A production-ready Google Chrome extension designed for competitive programming training camp administrators. It seamlessly tracks, filters, and exports the progress of 100+ students across multiple Codeforces Group Contests.

## Features

* **Multi-Contest Tracking:** Add and track multiple Codeforces contests by their ID simultaneously.
* **Upsolve Tracking:** Automatically distinguishes between in-contest solves (`CONTESTANT`) and post-contest upsolves (`PRACTICE`).
* **Advanced Conditional Engine:** Write Python-like logical and mathematical expressions to define custom eligibility rules (e.g., `(solved_123 + upsolve_123 >= 5) and attempted_456`).
* **Safe Expression Parser:** Evaluates custom conditions using a sandboxed Abstract Syntax Tree (AST) parser—no `eval()` used.
* **Spreadsheet Dashboard:** Clean, dynamic table optimized for 100+ students with automatic row numbering and strict cumulative (AND) filtering.
* **1-Click Export:** Export filtered or complete datasets to an Excel-compatible `.csv` file.
* **Secure API Integration:** Fully localized API credential management using the Web Crypto API for SHA-512 signed requests. Keys never leave your browser.

## 🛠️ Installation (Developer Mode)

1. Clone this repository or download the ZIP file and extract it.
   ```bash
   git clone https://github.com/OAY71011/cf-tracker-extension.git