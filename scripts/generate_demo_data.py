"""
scripts/generate_demo_data.py
Generate realistic company demo PDFs for end-to-end testing.
Creates 3 documents:
  1. Employee Handbook (HR policy document)
  2. Q4 2025 Financial Report (financial data with tables)
  3. Engineering Onboarding Guide (technical procedures)
"""
import os
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak
)

OUT_DIR = Path("tests/demo_data")
OUT_DIR.mkdir(parents=True, exist_ok=True)


def heading(text, level=1):
    styles = getSampleStyleSheet()
    if level == 1:
        return Paragraph(f"<b>{text}</b>",
            ParagraphStyle("h1", parent=styles["Heading1"], fontSize=18, spaceAfter=12))
    elif level == 2:
        return Paragraph(f"<b>{text}</b>",
            ParagraphStyle("h2", parent=styles["Heading2"], fontSize=14, spaceAfter=8))
    return Paragraph(f"<b>{text}</b>",
        ParagraphStyle("h3", parent=styles["Heading3"], fontSize=12, spaceAfter=6))


def body(text):
    styles = getSampleStyleSheet()
    return Paragraph(text, ParagraphStyle("body", parent=styles["Normal"],
                                          fontSize=10, spaceAfter=8, leading=14))


# ─────────────────────────────────────────────────────────
# Doc 1: Employee Handbook
# ─────────────────────────────────────────────────────────
def make_handbook():
    path = OUT_DIR / "employee_handbook.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4,
                            leftMargin=1.2*inch, rightMargin=1.2*inch,
                            topMargin=1*inch, bottomMargin=1*inch)
    story = []

    story.append(heading("Acme Corp — Employee Handbook 2025", 1))
    story.append(body("Version 3.2 | Effective: 1 January 2025 | Confidential"))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.2*inch))

    story.append(heading("1. Welcome to Acme Corp", 2))
    story.append(body(
        "Welcome to Acme Corp! We are delighted to have you join our team. This handbook "
        "explains the policies, benefits, and expectations that guide our workplace. Please "
        "read it carefully and refer to it whenever you have questions about company policy."
    ))

    story.append(heading("2. Work Hours & Remote Policy", 2))
    story.append(body(
        "Standard working hours are 9:00 AM – 6:00 PM, Monday through Friday. We operate a "
        "hybrid model: all employees are expected to be in the office at least three days per "
        "week (Tuesday, Wednesday, Thursday). Remote work on Monday and Friday is permitted "
        "with manager approval. Overtime must be pre-approved and is compensated at 1.5× the "
        "regular hourly rate."
    ))

    story.append(heading("3. Vacation & Leave Policy", 2))
    story.append(body(
        "All full-time employees receive 20 days of paid annual leave, accrued at 1.67 days per "
        "month. In addition to annual leave, employees receive 10 public holidays per year. "
        "Unused vacation days may be carried over up to a maximum of 5 days into the next "
        "calendar year. Vacation requests must be submitted at least 2 weeks in advance via "
        "the HR portal and are subject to manager approval."
    ))

    story.append(heading("Sick Leave", 3))
    story.append(body(
        "Employees are entitled to 12 days of paid sick leave per year. For absences exceeding "
        "3 consecutive days, a medical certificate is required. Sick leave does not carry over "
        "and resets on January 1st each year."
    ))

    story.append(heading("Parental Leave", 3))
    story.append(body(
        "Primary caregivers receive 16 weeks of fully paid parental leave. Secondary caregivers "
        "receive 4 weeks of fully paid parental leave. Parental leave must be taken within the "
        "first 12 months following the birth or adoption of a child."
    ))

    story.append(heading("4. Code of Conduct", 2))
    story.append(body(
        "Acme Corp is committed to a respectful and inclusive work environment. Discrimination, "
        "harassment, or bullying of any kind will not be tolerated. Violations of the Code of "
        "Conduct should be reported to HR at hr@acme.com or via the anonymous ethics hotline "
        "at 1-800-ACME-ETH."
    ))

    story.append(heading("5. Compensation & Benefits", 2))
    story.append(body(
        "Salaries are reviewed annually every April. Performance bonuses are distributed in "
        "January based on the prior year's company and individual performance. The company "
        "provides health insurance (medical, dental, vision) for employees and dependents, "
        "with 80% of the premium covered by Acme Corp."
    ))

    # Benefits table
    tbl = Table([
        ["Benefit", "Coverage", "Employee Contribution"],
        ["Medical Insurance", "Employee + Family", "20% of premium"],
        ["Dental Insurance", "Employee + Family", "20% of premium"],
        ["Vision Insurance", "Employee only", "0% (fully covered)"],
        ["Life Insurance", "2× Annual Salary", "0% (fully covered)"],
        ["401(k) Retirement", "Up to 5% match", "Employee contributes"],
        ["Gym Membership", "$50/month subsidy", "Remainder paid by employee"],
    ], colWidths=[2.5*inch, 2*inch, 2.2*inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#4a4e69")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f4f4f8")]),
        ("ALIGN", (0,0), (-1,-1), "LEFT"),
        ("PADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.2*inch))

    story.append(heading("6. IT & Security Policy", 2))
    story.append(body(
        "All company devices must run approved antivirus software and receive automatic OS "
        "updates. Employees must use a VPN when accessing company resources from outside the "
        "office. Passwords must be at least 14 characters and changed every 90 days. Never "
        "share your credentials with colleagues. Report suspected security incidents to "
        "security@acme.com immediately."
    ))

    story.append(heading("7. Procurement & Expenses", 2))
    story.append(body(
        "All purchases above $500 require pre-approval from the department head. Purchases "
        "above $5,000 require approval from the CFO. Expense reports must be submitted within "
        "30 days of the expense date using the Concur expense system. Receipts are required "
        "for all expenses above $25."
    ))

    doc.build(story)
    print(f"  ✓ Created: {path}")
    return path


# ─────────────────────────────────────────────────────────
# Doc 2: Q4 2025 Financial Report
# ─────────────────────────────────────────────────────────
def make_financial_report():
    path = OUT_DIR / "q4_2025_financial_report.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4,
                            leftMargin=1.2*inch, rightMargin=1.2*inch,
                            topMargin=1*inch, bottomMargin=1*inch)
    story = []

    story.append(heading("Acme Corp — Q4 2025 Financial Report", 1))
    story.append(body("Prepared by Finance | Confidential — For Internal Use Only"))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.2*inch))

    story.append(heading("Executive Summary", 2))
    story.append(body(
        "Acme Corp delivered a strong Q4 2025, with total revenue of $47.3M, representing "
        "22% year-over-year growth. EBITDA margin improved to 24.1%, up from 19.8% in Q4 2024. "
        "The company ended the quarter with $112M in cash and no long-term debt. Full-year "
        "revenue for FY2025 was $168.4M vs $138.2M in FY2024, a 21.8% increase."
    ))

    story.append(heading("Revenue Breakdown by Segment (Q4 2025)", 2))
    rev_table = Table([
        ["Segment", "Q4 2025 ($M)", "Q4 2024 ($M)", "YoY Growth"],
        ["Enterprise SaaS", "28.4", "21.6", "+31.5%"],
        ["SMB Subscriptions", "10.2", "9.1", "+12.1%"],
        ["Professional Services", "5.8", "5.2", "+11.5%"],
        ["Marketplace & API", "2.9", "2.9", "0.0%"],
        ["Total Revenue", "47.3", "38.8", "+21.9%"],
    ], colWidths=[2.5*inch, 1.7*inch, 1.7*inch, 1.5*inch])
    rev_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#2d6a4f")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#d8f3dc")),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,1), (-1,-2), [colors.white, colors.HexColor("#f0f7f4")]),
        ("ALIGN", (1,0), (-1,-1), "RIGHT"),
        ("ALIGN", (0,0), (0,-1), "LEFT"),
        ("PADDING", (0,0), (-1,-1), 7),
    ]))
    story.append(rev_table)
    story.append(Spacer(1, 0.2*inch))

    story.append(heading("P&L Summary (FY2025 vs FY2024)", 2))
    pl_table = Table([
        ["Metric", "FY2025 ($M)", "FY2024 ($M)", "Change"],
        ["Total Revenue", "168.4", "138.2", "+21.8%"],
        ["Cost of Revenue", "50.5", "47.0", "+7.4%"],
        ["Gross Profit", "117.9", "91.2", "+29.3%"],
        ["Gross Margin", "70.0%", "66.0%", "+4.0pp"],
        ["Operating Expenses", "79.2", "65.1", "+21.7%"],
        ["  — R&D", "32.1", "26.0", "+23.5%"],
        ["  — Sales & Marketing", "31.4", "26.3", "+19.4%"],
        ["  — G&A", "15.7", "12.8", "+22.7%"],
        ["EBITDA", "38.7", "26.1", "+48.3%"],
        ["EBITDA Margin", "23.0%", "18.9%", "+4.1pp"],
        ["Net Income", "22.4", "13.8", "+62.3%"],
    ], colWidths=[2.5*inch, 1.7*inch, 1.7*inch, 1.5*inch])
    pl_table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#1d3557")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#eef4fb")]),
        ("ALIGN", (1,0), (-1,-1), "RIGHT"),
        ("ALIGN", (0,0), (0,-1), "LEFT"),
        ("PADDING", (0,0), (-1,-1), 7),
    ]))
    story.append(pl_table)
    story.append(Spacer(1, 0.2*inch))

    story.append(heading("Key Business Metrics", 2))
    story.append(body(
        "Annual Recurring Revenue (ARR) reached $158M as of December 31, 2025, a 25% increase "
        "from $126.4M at year-end 2024. Net Revenue Retention (NRR) was 118%, indicating strong "
        "expansion within the existing customer base. Customer Acquisition Cost (CAC) improved to "
        "$8,200 from $9,500 in 2024. Customer Lifetime Value (LTV) to CAC ratio stands at 8.2×."
    ))

    story.append(heading("FY2026 Outlook", 2))
    story.append(body(
        "Management is guiding FY2026 revenue in the range of $200M–$210M (18–25% growth). "
        "EBITDA margin is expected to expand to 26–28% as revenue scale benefits take effect. "
        "Capital expenditures are planned at $12M, primarily for data centre infrastructure and "
        "AI/ML compute capacity. The company plans to initiate a $20M share buyback programme "
        "in Q2 2026."
    ))

    doc.build(story)
    print(f"  ✓ Created: {path}")
    return path


# ─────────────────────────────────────────────────────────
# Doc 3: Engineering Onboarding Guide
# ─────────────────────────────────────────────────────────
def make_onboarding_guide():
    path = OUT_DIR / "engineering_onboarding_guide.pdf"
    doc = SimpleDocTemplate(str(path), pagesize=A4,
                            leftMargin=1.2*inch, rightMargin=1.2*inch,
                            topMargin=1*inch, bottomMargin=1*inch)
    story = []

    story.append(heading("Engineering Onboarding Guide — 2025", 1))
    story.append(body("Platform Engineering | Internal | Updated: March 2025"))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.grey))
    story.append(Spacer(1, 0.2*inch))

    story.append(heading("Overview", 2))
    story.append(body(
        "This guide walks new engineers through everything they need to be productive at Acme. "
        "By the end of your first two weeks you should have a working local development "
        "environment, access to all required systems, and a merged first pull request."
    ))

    story.append(heading("Week 1: Setup & Access", 2))
    story.append(heading("Day 1 — Accounts & Tools", 3))
    story.append(body(
        "1. Your manager will create accounts in GitHub (acme-corp org), AWS, Slack, Jira, "
        "Confluence, and 1Password. You will receive an email invitation to each. "
        "2. Set up 1Password and store all credentials there. Never save passwords in plaintext. "
        "3. Enable MFA on all accounts using an authenticator app (Authy or 1Password TOTP). "
        "4. Install the approved company certificates by running: "
        "<font name='Courier'>sudo ./scripts/install_certs.sh</font>"
    ))

    story.append(heading("Day 2 — Local Dev Environment", 3))
    story.append(body(
        "Clone the monorepo: <font name='Courier'>git clone git@github.com:acme-corp/platform.git</font><br/>"
        "Install prerequisites: Docker Desktop 4.x, Node.js 22 LTS, Python 3.11+, Go 1.23+<br/>"
        "Start local services: <font name='Courier'>make dev-up</font><br/>"
        "This spins up PostgreSQL 16, Redis 7, Kafka 3.7, and Jaeger in Docker.<br/>"
        "Run the full test suite: <font name='Courier'>make test</font> — all 1,247 tests should pass."
    ))

    story.append(heading("Architecture Overview", 2))
    story.append(body(
        "The Acme platform is a microservices architecture deployed on AWS EKS. The main "
        "services are: "
        "(1) <b>api-gateway</b> — Kong-based API gateway handling auth, rate limiting, routing; "
        "(2) <b>core-api</b> — Python FastAPI service, the main business logic layer; "
        "(3) <b>data-pipeline</b> — Apache Kafka + Flink streaming pipeline; "
        "(4) <b>ml-platform</b> — Model training (SageMaker) and serving (Triton Inference Server); "
        "(5) <b>frontend</b> — Next.js 15 app deployed on Vercel."
    ))

    story.append(heading("Deployment & Release Process", 2))
    story.append(body(
        "We use GitFlow. All development happens on feature branches off <font name='Courier'>main</font>. "
        "PRs require approval from at least 2 engineers plus a passing CI build (GitHub Actions). "
        "Deployments to staging happen automatically on merge to <font name='Courier'>main</font>. "
        "Production releases are tagged (<font name='Courier'>v2025.xx.yy</font>) every two weeks "
        "on Tuesdays at 2PM UTC. Hotfixes can be deployed any time via the emergency release process "
        "documented in the Runbook."
    ))

    story.append(heading("On-Call & Incidents", 2))
    story.append(body(
        "All senior engineers participate in a weekly on-call rotation using PagerDuty. The "
        "on-call schedule is published 4 weeks in advance. For P0 incidents, the MTTR SLA is "
        "15 minutes to acknowledge and 2 hours to resolve. All incidents above P2 require a "
        "post-mortem written within 48 hours. The post-mortem template is available in Confluence."
    ))

    story.append(heading("Key Contacts", 2))
    contacts = Table([
        ["Team / Role", "Name", "Slack", "Email"],
        ["Engineering Manager", "Sarah Chen", "@sarah.chen", "s.chen@acme.com"],
        ["Principal Engineer", "James Okafor", "@james.o", "j.okafor@acme.com"],
        ["DevOps Lead", "Priya Nair", "@priya.n", "p.nair@acme.com"],
        ["Security", "Marco Bianchi", "@marco.sec", "m.bianchi@acme.com"],
        ["HR (Engineering)", "Aisha Osei", "@aisha.hr", "a.osei@acme.com"],
    ], colWidths=[1.8*inch, 1.5*inch, 1.5*inch, 2.0*inch])
    contacts.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#6d4c9e")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 9),
        ("GRID", (0,0), (-1,-1), 0.5, colors.lightgrey),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, colors.HexColor("#f5f0ff")]),
        ("ALIGN", (0,0), (-1,-1), "LEFT"),
        ("PADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(contacts)

    doc.build(story)
    print(f"  ✓ Created: {path}")
    return path


if __name__ == "__main__":
    print("Generating demo PDFs...")
    p1 = make_handbook()
    p2 = make_financial_report()
    p3 = make_onboarding_guide()
    print(f"\nAll demo documents created in: {OUT_DIR.resolve()}")
    for p in [p1, p2, p3]:
        size = p.stat().st_size // 1024
        print(f"  {p.name}: {size} KB")
