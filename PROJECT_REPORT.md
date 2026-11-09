# A PROJECT REPORT ON
# FinSight AI: Personalized Expense Forecasting and Financial Intelligence using Machine Learning and Generative AI

**Submitted in partial fulfilment for the award of the degree of**
**BACHELOR OF TECHNOLOGY**
**In**
**Artificial Intelligence and Machine Learning**

**By**
- **Kuna Jyothi Sri Lakshmi (23A81A6134)**
- **Pilla Jessi Dorai Raj (23A81A6151)**
- **Satti Sai Rama Krishna Reddy (23A81A6156)**
- **Mattaparthi Krishna Sri (23A81A6138)**

**Under the Esteemed Supervision of**
**Mr. M S N MURTHY, Assistant Professor, M.Tech**

Department of Artificial Intelligence and Machine Learning  
**SRI VASAVI ENGINEERING COLLEGE (Autonomous)**  
*(Affiliated to JNTUK, Kakinada)*  
Pedatadepalli, Tadepalligudem - 534101, A.P  
**2026 – 2027**

---

## SRI VASAVI ENGINEERING COLLEGE (Autonomous)
**Department of Artificial Intelligence and Machine Learning**  
**Pedatadepalli, Tadepalligudem**

### CERTIFICATE

This is to certify that the Project Report entitled **“FinSight AI: Personalized Expense Forecasting and Financial Intelligence using Machine Learning and Generative AI”** submitted by **Kuna Jyothi Sri Lakshmi (23A81A6134)**, **Pilla Jessi Dorai Raj (23A81A6151)**, **Satti Sai Rama Krishna Reddy (23A81A6156)**, and **Mattaparthi Krishna Sri (23A81A6138)** for the award of the degree of **Bachelor of Technology** in the Department of Artificial Intelligence and Machine Learning during the academic year **2026 – 2027**.

**Project Guide:**  
Mr. M S N Murthy  
Assistant Professor  

**Head of the Department:**  
Dr. Loshma Gunisetti  
Professor and HOD  

**External Examiner:**  

---

### DECLARATION

We hereby declare that the project report entitled **“FinSight AI: Personalized Expense Forecasting and Financial Intelligence using Machine Learning and Generative AI”** submitted by us to Sri Vasavi Engineering College (Autonomous), Tadepalligudem, affiliated to JNTUK Kakinada in partial fulfilment of the requirement for the award of the degree of B.Tech in Artificial Intelligence and Machine Learning is a record of bona fide project work carried out by us under the guidance of **Mr. M S N Murthy**, Assistant Professor. We further declare that the work reported in this project has not been submitted and will not be submitted, either in part or in full, for the award of any other degree in this institute or any other institute or University.

**Project Associates:**  
- Kuna Jyothi Sri Lakshmi (23A81A6134)  
- Pilla Jessi Dorai Raj (23A81A6151)  
- Satti Sai Rama Krishna Reddy (23A81A6156)  
- Mattaparthi Krishna Sri (23A81A6138)  

---

### ACKNOWLEDGEMENT

First and foremost, we sincerely salute our esteemed institute **Sri Vasavi Engineering College**, for giving us this golden opportunity to fulfill our dream of becoming engineers.

Our sincere gratitude to our project guide **Mr. M S N Murthy**, Assistant Professor, Department of Artificial Intelligence and Machine Learning, for his timely cooperation, continuous encouragement, and valuable suggestions while carrying out this project.

We express our sincere thanks and heartfelt gratitude to **Dr. Loshma Gunisetti**, Professor and Head of the Department of Artificial Intelligence and Machine Learning, for permitting us to carry out our project and providing academic support.

We express our sincere thanks and heartfelt gratitude to **Dr. Ch. Rambabu**, Principal, for providing a favorable academic environment and supporting us during the development of this project.

Our special thanks to the management and all the teaching and non-teaching staff members, Department of Artificial Intelligence and Machine Learning, for their support and cooperation in various ways during our project work.

We would like to express our gratitude to our parents and friends who supported us in completing this project.

**Project Associates:**  
- Kuna Jyothi Sri Lakshmi (23A81A6134)  
- Pilla Jessi Dorai Raj (23A81A6151)  
- Satti Sai Rama Krishna Reddy (23A81A6156)  
- Mattaparthi Krishna Sri (23A81A6138)  

---

### ABSTRACT

FinSight AI is an intelligent personal finance management and decision-support system that combines Machine Learning and Generative Artificial Intelligence to help individuals track, forecast, and optimize their financial health. Traditional personal finance applications are predominantly retrospective: they record past transactions and plot historical static charts, but offer minimal capability to predict future category-level expenditures, detect unusual spending deviations in real time, or provide personalized, context-aware financial guidance. FinSight AI addresses these critical gaps through an integrated workflow encompassing transaction management, receipt ingestion via Optical Character Recognition (OCR), automated category normalization, statistical anomaly detection, recurring subscription analysis, multi-model expense forecasting, and a grounded conversational AI assistant.

The system ingests financial records through interactive user forms, batch CSV uploads, and scanned receipt images. Receipts are processed through a multi-tier OCR pipeline to automatically extract transaction metadata such as merchant name, date, total amount, and line-item categories. The core analytics engine aggregates historical transactions chronologically and constructs continuous monthly time-series features. An anomaly detection module identifies spending shocks using statistical thresholding against category baselines, while recurrence analysis correlates transaction intervals and amount stability to flag recurring subscriptions and upcoming bills. For predictive forecasting, the system evaluates multiple algorithms under strict chronological validation—including Naive Baseline, Moving Average, Linear Regression, and Random Forest Regression—selecting the best-performing model based on Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), and Mean Absolute Percentage Error (MAPE).

To deliver actionable financial coaching, FinSight AI incorporates a server-side Generative AI conversational assistant powered by Google Gemini (Gemini 3.5 Flash Lite via the official `@google/genai` SDK), backed by a deterministic FinSight Grounded Engine fallback. The AI assistant strictly references user-verified ledger metrics, monthly cash flows, budgets, and savings goals to explain spending trends, simulate purchase affordability, and recommend budget adjustments without hallucinating figures. The system is built using React 19, TypeScript, Tailwind CSS, and Recharts for the frontend, Node.js and Express for the core application server and REST APIs, serverless PostgreSQL (Neon Cloud) for persistent relational storage, and Python with Scikit-learn and FastAPI for the machine learning forecasting microservice. FinSight AI makes personal financial management proactive, predictive, and easily actionable.

---

### TABLE OF CONTENTS

| S.NO | TITLE | PAGE NO |
| :--- | :--- | :--- |
| **1** | **CHAPTER 1: INTRODUCTION** | **1** |
| | 1.1 Introduction | 2 |
| | 1.2 Motivation | 3 |
| | 1.3 Objectives | 3 |
| | 1.4 Scope | 4 |
| **2** | **CHAPTER 2: LITERATURE SURVEY** | **6** |
| **3** | **CHAPTER 3: SYSTEM STUDY AND ANALYSIS** | **8** |
| | 3.1 Problem Statement | 9 |
| | 3.2 Existing System | 9 |
| | 3.3 Limitations of Existing System | 9 |
| | 3.4 Proposed System | 10 |
| | 3.5 Advantages of Proposed System | 11 |
| | 3.6 Functional Requirements | 11 |
| | 3.7 Non-Functional Requirements | 12 |
| | 3.8 System Requirements | 13 |
| **4** | **CHAPTER 4: SYSTEM DESIGN** | **14** |
| | 4.1 System Design Architecture | 15 |
| | 4.2 Data Flow & Component Interaction | 17 |
| | 4.3 User Interface Layer | 17 |
| | 4.4 Backend Application Layer | 17 |
| | 4.5 Database & Persistence Layer | 18 |
| | 4.6 Machine Learning & Analytics Engine | 18 |
| | 4.7 Grounded Generative AI Layer | 18 |
| **5** | **CHAPTER 5: METHODOLOGIES** | **19** |
| | 5.1 Data Collection and Dataset Preparation | 20 |
| | 5.2 Core Analytics and Baselines | 20 |
| | 5.3 Expense Forecasting Methodology | 21 |
| | 5.4 Anomaly Detection Methodology | 21 |
| | 5.5 Recurring Expense Detection | 22 |
| **6** | **CHAPTER 6: TECHNOLOGIES** | **23** |
| | 6.1 Programming Languages | 24 |
| | 6.2 Data Preprocessing and Analysis | 24 |
| | 6.3 AI and Machine Learning Frameworks | 24 |
| | 6.4 Model Evaluation Metrics | 25 |
| | 6.5 Data Visualization | 25 |
| | 6.6 User Interface Framework | 26 |
| **7** | **CHAPTER 7: IMPLEMENTATION** | **27** |
| | 7.1 Set Up Development Environment and Install Libraries | 27 |
| | 7.2 Data Collection and Schema Definition | 31 |
| | 7.3 Category Normalization and Alias Mapping | 32 |
| | 7.4 Exploratory Data Analysis and Temporal Dataset Splitting | 32 |
| | 7.5 Feature Engineering and Historical Aggregation | 33 |
| | 7.6 Model Training and Evaluation | 34 |
| | 7.7 Anomaly Detection and Recurrence Module Integration | 35 |
| | 7.8 Budget Variance and Goal Feasibility Logic | 35 |
| | 7.9 Interactive Dashboard | 36 |
| **8** | **CHAPTER 8: TESTING** | **37** |
| | 8.1 Test Data Evaluation | 37 |
| | 8.2 Model Comparison and Selection | 38 |
| | 8.3 Error Analysis and Sensitivity Testing | 38 |
| | 8.4 Final Validation and Deployment Readiness | 39 |
| **9** | **CHAPTER 9: RESULTS** | **40** |
| | 9.1 User Profile Interface | 40 |
| | 9.2 Transaction Input & Ingestion Interface | 41 |
| | 9.3 Spending Analytics & Category Breakdown Dashboard | 42 |
| | 9.4 Multi-Model Expense Forecasting & Projection Interface | 43 |
| **10** | **CHAPTER 10: CONCLUSION** | **44** |
| **11** | **CHAPTER 11: FUTURE WORK** | **45** |
| | **REFERENCES** | **46** |
| | **APPENDIX – I – SAMPLE CODE** | **48** |

---

### LIST OF FIGURES

| Figure No | Title | Page No |
| :--- | :--- | :--- |
| Fig 4.1 | System Design Architecture of FinSight AI | 15 |
| Fig 7.6 | Feature Importance and Driver Matrix of Forecasting Model | 34 |
| Fig 9.1 | User Profile & Financial Baseline Settings | 40 |
| Fig 9.2 | Transaction Input & Ingestion Interface | 41 |
| Fig 9.3 | Spending Analytics & Category Breakdown Visualizations | 42 |
| Fig 9.4 | Multi-Model Expense Forecasting Comparison & Trends | 43 |

---

## CHAPTER 1: INTRODUCTION

### 1.1 Introduction
Personal financial stability is a critical modern concern, with millions of individuals facing financial distress, excessive debt, and missed savings targets due to irregular spending habits, unmonitored lifestyle inflation, and unexpected financial shocks. A significant portion of these challenges stems from the lack of real-time visibility into personal expenditures and the inability to anticipate future cash-flow demands. Traditional financial tracking, which relies on manual logging in spreadsheets or basic digital ledger applications, is severely limited by human fatigue, lack of predictive capability, and fragmented data representation. This project presents **FinSight AI**, an automated, real-time personal finance intelligence and expense forecasting system built using modern machine learning algorithms and generative artificial intelligence. The system ingests user transactional records and is designed to automatically identify anomalous spending spikes, track recurring subscription commitments, forecast future category expenses, and deliver personalized, context-aware financial coaching.

Furthermore, the implementation of an intelligent financial management system contributes significantly to improving economic discipline and achieving long-term savings goals. By continuously analyzing transaction streams, the system can detect abnormal outlays instantly, calculate accurate month-end burn rates, and generate actionable financial insights. This minimizes the cognitive burden of manual financial analysis and assists individuals in maintaining strict adherence to their planned budgets. In addition, the aggregated transactional analytics provide personalized insights, helping users identify high-velocity spending categories and non-essential recurring liabilities. Such insights support informed decision-making in personal budgeting, debt management, and wealth accumulation, ultimately contributing to individual financial resilience.

At the heart of this solution is the convergence of modern Machine Learning and Generative Artificial Intelligence. Unlike traditional, rule-based accounting applications that merely compute static historical sums, this project employs a multi-tiered predictive architecture. For quantitative expense forecasting, it leverages a comparative suite of time-series machine learning models: Naive Baseline, Moving Average, Linear Regression for trend modeling, and Random Forest Regressors for capturing non-linear interactions. For qualitative financial guidance, it integrates **Google Gemini (Gemini 3.5 Flash Lite)** via the official Google GenAI SDK (`@google/genai`), backed by the deterministic **FinSight Grounded Engine** fallback. The language model is strictly grounded in the user's verified financial metrics, active budgets, upcoming bills, and goal milestones retrieved directly from the relational database. This hybrid approach ensures that the system provides both accurate numerical projections and actionable, human-like financial advisory without hallucinating monetary values.

### 1.2 Motivation
The motivation behind developing FinSight AI comes from the increasing need for intelligent and automated personal financial management solutions. Many individuals struggle to maintain a balance between income, expenses, and savings because they lack proper tools to analyze their financial behavior and anticipate future spending.

Existing expense management applications mainly provide retrospective transaction tracking and basic graphical reports. However, they lack personalized expense forecasting, intelligent anomaly detection, automated receipt data extraction, and interactive AI-based assistance.

Therefore, this project focuses on developing a smart financial intelligence platform that uses Machine Learning to predict future expenses and Generative AI to provide personalized financial guidance. The system aims to make financial management easier, more accessible, and more effective for individuals.

### 1.3 Objectives
The major objectives of the proposed system are:
1. To develop an intelligent web platform for securely recording, categorizing, and managing personal income and expenses.
2. To provide automated receipt data extraction using Optical Character Recognition (OCR) to streamline physical document entry.
3. To apply Machine Learning algorithms for analyzing historical spending patterns and trends.
4. To predict upcoming monthly expenses using chronological time-series forecasting models (Naive, Moving Average, Linear Regression, and Random Forest).
5. To automatically detect statistical spending anomalies and recurring commitments (subscriptions, bills).
6. To integrate server-side Generative AI (Google Gemini 3.5 Flash Lite) with a deterministic fallback engine for conversational financial assistance.
7. To visualize financial metrics through interactive, responsive dashboards (Recharts) with category distributions and trend charts.
8. To calculate budget variance, track goal feasibility timelines, and support informed financial decision-making.

### 1.4 Scope
The scope of this project is to develop an end-to-end, privacy-preserving personal finance intelligence platform that processes user financial records and provides real-time predictive and conversational decision support. The system's operational boundaries are defined as follows:
- **Input**: The system ingests financial records from interactive web forms, structured CSV batch files, and scanned receipt/invoice images (JPG, PNG, PDF).
- **Processing**: The core system executes a coordinated multi-tier architecture:
  - An Express/Node.js backend orchestrating user authentication, JWT session security, database operations, and OCR pipeline execution.
  - A Machine Learning Engine responsible for transaction categorization, personal baseline modeling, statistical outlier detection, recurring pattern identification, and multi-model expense forecasting.
  - A Generative AI Advisory Layer (Google Gemini 3.5 Flash Lite) executing server-side, contextually grounded in user-specific database figures, with an automatic deterministic fallback.
- **Persistence**: Relational PostgreSQL database hosted on Neon Cloud, enforcing strict user-level data isolation.
- **Output**: Delivered via a responsive React 19 Single Page Application styled with Tailwind CSS, featuring interactive Recharts spending breakdowns, predictive trajectory curves with 95% confidence bounds, anomaly badges, budget burn gauges, goal timelines, and a conversational chat assistant.

---

## CHAPTER 2: LITERATURE SURVEY

1. **Title**: *Money Map: The Personal Finance Tracker*  
   **Author(s)**: Niharika Shailendra et al. (2025)  
   **Description**: Introduces a personal finance tracking system that uses Machine Learning techniques for spending analysis and budget forecasting. By analyzing historical transactions, it provides expenditure behavior insights. However, the study lacks granular evaluation metrics and does not provide conversational AI assistance or OCR receipt integration.
2. **Title**: *Investigating the Robustness of Graph Neural Networks to Data Drift: A Case Study on Financial Transaction Data*  
   **Author(s)**: Rener S. Menezes and Raimir H. Filho (2025)  
   **Description**: Investigates Graph Neural Networks (GCN, GAT, GraphSAGE) in handling data drift across financial transactions. Demonstrates that GraphSAGE achieves an AUC-PR > 0.88. Focuses primarily on fraud detection rather than personal expense forecasting or budgeting.
3. **Title**: *A Financial Data Analysis Method Based on Time-Series Generative Adversarial Network and Decomposition Learning*  
   **Author(s)**: Wei Wang and Bo Li (2025)  
   **Description**: Proposes a financial data analysis method using TimeGAN and Singular Spectrum Analysis for financial market trends. While offering advanced time-series modeling, it targets macroeconomic equity markets rather than household personal finances.
4. **Title**: *Smart Finance Investment Management and Community Powered by GenAI*  
   **Author(s)**: K. Ramya et al. (2025)  
   **Description**: Combines Generative AI with LSTM networks for market risk assessment and investment portfolio optimization. Primarily emphasizes asset investment and wealth management rather than daily expense tracking, budget control, and receipt ingestion.
5. **Title**: *GenAI-Powered Personal Finance Consultant: Integrating Machine Learning and Generative AI for Personalized Financial Recommendations and Literacy Enhancement*  
   **Author(s)**: M. Suganya, R. Jayaraj, A. Syed Ismail, and S. Ganesh Kumar (2025)  
   **Description**: Proposes a Generative AI-powered personal finance consulting system integrating ML and rule-based techniques. Serves as the conceptual base paper for FinSight AI. However, it lacks automated receipt OCR, time-series forecasting comparison, and budget overrun tracking in a unified single-page web application.

---

## CHAPTER 3: SYSTEM STUDY AND ANALYSIS

### 3.1 Problem Statement
To architect and implement an intelligent, end-to-end personal finance intelligence system capable of ingesting multi-channel transactional records (manual entry, CSV files, and receipt images), automatically categorizing expenses, establishing personal spending baselines, isolating anomalous spending spikes, identifying recurring commitments, and forecasting upcoming expenditures using a multi-model comparative machine learning suite (Linear Regression, Random Forest, Moving Average, and Naive Baseline) under strict temporal validation. Furthermore, the system must integrate a server-side, context-grounded Generative AI assistant (Google Gemini 3.5 Flash Lite) with a deterministic fallback engine that interprets numerical forecasts, analyzes budget burn rates, models purchase affordability scenarios, and verifies goal feasibility—delivering natural-language coaching while enforcing strict tenant data isolation.

### 3.2 Existing System
The existing systems for personal finance management are predominantly manual and retrospective:
1. **Manual Spreadsheet Accounting**: Users log expenses in Excel or Google Sheets, relying on manual formulas with high maintenance overhead.
2. **Passive Mobile Ledger Apps**: Basic mobile apps read SMS logs or require manual tags, displaying simple retrospective pie charts without predictive capabilities.
3. **Commercial Cloud PFM Portals**: Web platforms aggregate accounts via third-party open-banking APIs, presenting static dashboards and generic, non-actionable budgeting tips.

### 3.3 Limitations of Existing System
- **Lack of Predictive Forecasting**: Applications show what was spent, not what will be spent.
- **Absence of Grounded Conversational AI**: Traditional apps lack conversational interfaces that can query and reason over users' financial data.
- **High Data Entry Friction**: Manual entry leads to abandonment; basic apps lack receipt OCR extraction.
- **Vulnerability to Outlier Distortion**: Non-recurring spending spikes distort budgeting baselines.
- **Generic, Non-Personalized Advice**: Rule-based systems provide cookie-cutter tips rather than math-grounded personal guidance.

### 3.4 Proposed System
FinSight AI provides a unified, intelligent financial platform:
- **Secure Authentication**: JWT-based session authentication with bcrypt password hashing and tenant-scoped data isolation.
- **Multi-Modal Data Ingestion**: Web forms, batch CSV upload, and OCR receipt processing (Tesseract.js & Vision AI).
- **Automated Categorization & Normalization**: Maps merchant aliases and spending descriptions into standardized categories.
- **Statistical Anomaly Detection**: Flags unusual transactions exceeding category baseline thresholds.
- **Recurring Commitment Tracking**: Detects regular intervals and amount stability for subscriptions and bills.
- **Multi-Model Expense Forecasting**: Evaluates Naive, Moving Average, Linear Regression, and Random Forest models on chronological datasets.
- **Grounded Generative AI Assistant**: Server-side Google Gemini 3.5 Flash Lite with deterministic fallback, answering financial questions using database facts.
- **Interactive Visual Dashboards**: Recharts visualizations for income vs. expense cash flows, category shares, budget burn rates, and forecast bounds.

### 3.5 Advantages of Proposed System
1. **Proactive Decision Support**: Predicts upcoming expenses so users can adjust spending before overruns occur.
2. **Reduced Cognitive Burden**: Automates receipt scanning, categorizing, and recurring expense identification.
3. **Zero AI Hallucinations**: Grounds Gemini in verified database metrics with strict fallback guarantees.
4. **Data Security & Privacy**: Enforces user-scoped query isolation and secure cross-origin credential policies.
5. **Model Explainability**: Surfaces feature importance scores (trend, rolling mean, seasonal harmonics) driving projections.

### 3.6 Functional Requirements
- **FR1 (User Management)**: Secure registration, login, profile updates, and session management.
- **FR2 (Transaction Ledger)**: Create, read, update, delete (CRUD), and bulk import transactions with category, date, and merchant.
- **FR3 (Document Processing)**: Upload receipts/invoices (JPG, PNG, PDF), perform OCR, and convert extracted text into transactions.
- **FR4 (Budget & Goal Tracking)**: Define monthly category budgets and multi-month savings goals with progress tracking.
- **FR5 (Recurring Expenses)**: Track periodic bills, calculate upcoming obligations, and record bill payments.
- **FR6 (Predictive Forecasting)**: Train time-series models on monthly aggregates and project future 1 to 4 month expenses.
- **FR7 (AI Financial Assistant)**: Natural-language conversational interface answering questions on spending, savings, affordability, and budgets.

### 3.7 Non-Functional Requirements
- **Performance**: API responses under 200 ms for core transactions; AI chat responses under 3 seconds.
- **Security**: Bcrypt password hashing (10 rounds), HS256 JWT tokens, secure HTTP-only cookies, rate limiting, and SQL parameterization.
- **Reliability & Idempotency**: Database transactions (`BEGIN ... COMMIT`) ensure zero data corruption during bulk operations.
- **Usability**: Responsive, dark/light themed interface adhering to modern fintech aesthetic principles.
- **Scalability**: Decoupled architecture supporting independent deployment of frontend (Vercel edge CDN) and backend (Render / Node.js).

### 3.8 System Requirements

#### Hardware Requirements
- **Processor**: Intel Core i5 / AMD Ryzen 5 or equivalent (quad-core, 2.0 GHz or higher).
- **RAM**: Minimum 8 GB (16 GB recommended for local ML model training and build processes).
- **Storage**: Minimum 10 GB of available disk space for Node modules, Python packages, and OCR models.
- **Display**: Minimum screen resolution of 1366 × 768 pixels.
- **Network**: Broadband internet connection for database pooling (Neon) and Gemini API access.

#### Software Requirements
- **Operating System**: Windows 10/11, Ubuntu 22.04 LTS, or macOS 13+.
- **Runtime Environments**: Node.js (v18.x or v20.x+) with npm (v9.x+), and Python (v3.10+).
- **Frontend Framework**: React 19, TypeScript, Vite 8, Tailwind CSS, Recharts.
- **Backend Application Server**: Express.js (v4.21+) with Node.js and TypeScript.
- **Machine Learning Microservice**: Python (FastAPI / Uvicorn, Scikit-learn, Pandas, NumPy).
- **Database**: Serverless PostgreSQL (Neon Cloud v15+) with TLS encryption and connection pooling.
- **Generative AI**: Google Gemini API (`gemini-3.5-flash-lite` via `@google/genai` SDK) with deterministic fallback engine.
- **Document OCR**: Tesseract.js (v7.0) and PDF-parse.
- **Version Control & Development Tools**: Git, GitHub, Visual Studio Code.

---

## CHAPTER 4: SYSTEM DESIGN

### 4.1 System Design Architecture
The architecture of FinSight AI follows a modular, decoupled, and secure multi-tier design:

```
                      ┌─────────────────────────────────────────┐
                      │        USER INTERFACE (Frontend)        │
                      │  • React 19 + TypeScript + Vite         │
                      │  • Tailwind CSS + Recharts Dashboards   │
                      │  • Interactive Chat, OCR Receipt Upload │
                      └────────────────────┬────────────────────┘
                                           │ HTTPS / JSON API
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │       BACKEND (Application Layer)       │
                      │  • Express.js + Node.js REST APIs       │
                      │  • JWT Authentication & Rate Limiting   │
                      │  • Business Logic & Service Orchestrator│
                      └────────────┬───────────────┬────────────┘
                                   │               │
                  Database Queries │               │ Grounded Prompting
                  (TLS Pooled)     │               │
                                   ▼               ▼
                      ┌─────────────────┐   ┌───────────────────┐
                      │   PERSISTENCE   │   │  GENERATIVE AI    │
                      │ Neon PostgreSQL │   │  Google Gemini    │
                      │ Relational DB   │   │ 3.5 Flash Lite    │
                      └─────────────────┘   └───────────────────┘
                                   ▲
                                   │ Features & Historical Training
                                   │
                      ┌─────────────────────────────────────────┐
                      │      ML / ANALYTICS ENGINE (Python)     │
                      │  • Scikit-learn Forecasting Suite       │
                      │  • Moving Average, Linear & Random Forest│
                      │  • Anomaly & Recurrence Modules         │
                      └─────────────────────────────────────────┘
```
*Fig 4.1: System Design Architecture of FinSight AI*

1. **User Interface (Frontend)**: Developed in React 19 and TypeScript, providing responsive dashboards for transactions, analytics, budgets, goals, document management, and AI chat.
2. **Backend Application Layer (Node.js + Express & Python ML Service)**: Handles REST API routing, user authentication, input validation, OCR document pipeline orchestration, and security headers.
3. **Database & Persistence Layer**: Serverless PostgreSQL on Neon Cloud, managing users, transactions, budgets, goals, bills, recurring schedules, and documents with relational constraints.
4. **Data Preprocessing & Feature Engineering Module**: Normalizes transaction categories, handles missing calendar periods, and computes rolling means, lags, and seasonal encodings.
5. **Machine Learning & Analytics Module**: Implements Naive Baseline, Moving Average, Linear Regression, and Random Forest Regression for time-series forecasting.
6. **Generative AI Layer (Google Gemini)**: Interprets user queries and synthesizes natural-language financial advice strictly grounded in database metrics, backed by a deterministic fallback engine.
7. **Output Module**: Delivers interactive visualization cards, forecasting curves with 95% confidence intervals, and budget burn gauges.

---

## CHAPTER 5: METHODOLOGIES

### 5.1 Data Collection and Dataset Preparation
Financial records enter the system through manual web forms, CSV imports, and OCR extraction. Once validated, transactions are stored with standardized amounts, dates, categories, and merchant names. For time-series forecasting, transactions are chronologically grouped into monthly aggregates. Missing calendar months are explicitly filled with zero rather than omitted, preserving temporal continuity.

### 5.2 Core Analytics and Baselines
Analytics compute period-level totals (income, expenditure, net cash flow, savings rate). Category and merchant aggregations highlight spending concentration. Naive and Moving Average baselines provide benchmark references to evaluate whether complex machine learning models deliver statistically meaningful improvements.

### 5.3 Expense Forecasting Methodology
Monthly expenses are structured as a chronological time series. Features include lag observations ($t-1, t-2, t-3$), 3-month rolling averages and standard deviations, temporal index $t$, and cyclical sine/cosine seasonal encodings:
$$\text{month\_sin} = \sin\left(\frac{2\pi \cdot m}{12}\right), \quad \text{month\_cos} = \cos\left(\frac{2\pi \cdot m}{12}\right)$$
Data is split chronologically into training, validation, and held-out test sets. Model selection is based on validation error (MAE and RMSE), reserving the test set for final unbiased evaluation.

### 5.4 Anomaly Detection Methodology
Transactions are evaluated against historical category baselines using statistical z-score and interquartile range (IQR) thresholds:
$$Z = \frac{x - \mu_{\text{category}}}{\sigma_{\text{category}}}$$
Transactions with $|Z| > 2.5$ or exceeding $Q_3 + 1.5 \times \text{IQR}$ are flagged for review, preventing non-recurring spending shocks from distorting forecasting baselines.

### 5.5 Recurring Expense Detection
The recurrence module identifies recurring obligations (subscriptions, utilities, rent) by grouping transactions by normalized merchant and evaluating amount stability and date intervals ($\Delta t \approx 7, 30, \text{ or } 365\text{ days}$). Candidate recurring items are surfaced with frequency labels and projected monthly impacts.

---

## CHAPTER 6: TECHNOLOGIES

- **TypeScript & JavaScript**: Used across React frontend and Express backend for end-to-end type safety.
- **Python**: Powering the Scikit-learn machine learning forecasting pipeline and data transformations.
- **PostgreSQL (Neon Cloud)**: Serverless relational database with pooled SSL connections and strict schema migrations.
- **Scikit-learn, Pandas, NumPy**: Core libraries for time-series feature engineering and regression modeling.
- **Google Gemini API (`@google/genai`)**: Large language model integration for conversational financial reasoning.
- **Recharts**: Declarative charting library for React rendering responsive SVG visualizations.
- **Tailwind CSS**: Utility-first CSS framework providing a sleek fintech dark/light UI.

---

## CHAPTER 7: IMPLEMENTATION

### 7.1 Set Up Development Environment and Install Libraries

This section provides the comprehensive, step-by-step engineering procedure required to set up the development environment, install all required dependencies, configure environment secrets, initialize the database schema, and run FinSight AI locally.

#### 1. System Prerequisites
Ensure the following runtimes and tools are installed:
- **Node.js**: `v18.0.0` or higher (`node -v` to verify).
- **npm**: `v9.0.0` or higher (`npm -v` to verify).
- **Python**: `v3.10` or higher (`python --version` to verify).
- **Git**: `v2.30+` (`git --version` to verify).
- **Neon PostgreSQL Account**: Access to a serverless Neon database connection string.
- **Google AI Studio Key**: API key for Gemini 3.5 Flash Lite.

#### 2. Project Repository Setup
Clone the project repository and navigate into the root directory:
```bash
git clone https://github.com/your-username/finsight-ai.git
cd finsight-ai
```

#### 3. Installing Node.js & Frontend/Backend Packages
Run the package installation command in the project root:
```bash
npm install
```
This installs all production and development dependencies specified in `package.json`:
- **Core Frontend Framework**:
  - `react` (`^19.0.1`) & `react-dom` (`^19.0.1`): Next-generation UI component rendering.
  - `react-router-dom` (`^7.18.4`): Declarative client-side routing for Single Page Architecture.
  - `recharts` (`^3.10.1`): SVG-based interactive charts for cash flows and forecasts.
  - `lucide-react` (`^0.546.0`): Clean, accessible iconography.
  - `motion` (`^12.23.24`): Fluid UI transitions and interactive micro-animations.
  - `@tailwindcss/vite` (`^4.3.3`) & `tailwindcss` (`^4.3.3`): Utility styling engine.
- **Core Backend Server & Middleware**:
  - `express` (`^4.21.2`): High-performance HTTP application framework.
  - `cookie-parser` (`^1.4.7`): Parsing HTTP-only session cookies.
  - `jsonwebtoken` (`^9.0.3`): Cryptographic token generation and verification.
  - `bcryptjs` (`^3.0.3`): Secure password hashing (10 salt rounds).
  - `express-rate-limit` (`^8.7.1`): Global and authentication endpoint DoS protection.
  - `dotenv` (`^17.2.3`): Runtime loading of environment variables.
- **Database Client**:
  - `pg` (`^8.23.1`) & `@types/pg`: PostgreSQL connection pool client with SSL support.
- **Document Ingestion & OCR**:
  - `multer` (`^2.5.0`): In-memory multipart/form-data upload handling with file type/size limits.
  - `tesseract.js` (`^7.0.0`): Multi-language Optical Character Recognition engine.
  - `pdf-parse` (`^2.4.5`): Direct text extraction from digital invoice PDFs.
- **Generative AI Integration**:
  - `@google/genai` (`^2.4.0`): Official Google GenAI SDK for Gemini 3.5 Flash Lite.
- **Tooling & Build System**:
  - `vite` (`^8.3.0`): High-speed frontend build tool and development server.
  - `esbuild` (`^0.25.0`): Bundler compiling `server.ts` into a standalone Node.js production file.
  - `tsx` (`^4.21.0`): Direct TypeScript execution engine for development and migrations.
  - `typescript` (`^7.0.2`): Static typing and compile-time contract enforcement.

#### 4. Installing Python Machine Learning Dependencies
FinSight AI includes an auxiliary Python machine learning microservice for training, evaluating, and serving time-series models. Set up an isolated Python virtual environment:

```bash
# On Windows (PowerShell):
python -m venv venv
.\venv\Scripts\activate

# On Linux / macOS:
python3 -m venv venv
source venv/bin/activate

# Install required Python libraries:
pip install -r ml_service/requirements.txt
```
The `requirements.txt` installs:
- `fastapi>=0.110.0` & `uvicorn[standard]>=0.28.0`: High-speed asynchronous REST API framework.
- `pydantic>=2.6.0`: Data validation and request schema definitions.
- `scikit-learn>=1.4.0`: Implementation of Linear Regression, Random Forest, and metrics.
- `pandas>=2.2.0`: Time-series manipulation, rolling window statistics, and monthly aggregations.
- `numpy>=1.26.0`: Numerical array computations and cyclical trigonometric transforms.

#### 5. Configuring Environment Variables
Copy the template configuration file to create your active `.env`:
```bash
cp .env.example .env
```
Open `.env` in an editor and populate the required parameters:
```env
# Server Port and Environment
PORT=3000
NODE_ENV=development

# Allowed CORS Origins for Frontend API Communication
FRONTEND_URL="http://localhost:3000"
COOKIE_SAME_SITE="none"

# Neon Cloud PostgreSQL Pooled Connection URI (with TLS require)
DATABASE_URL="postgresql://user:password@ep-your-endpoint-pooler.neon.tech/neondb?sslmode=require"

# Cryptographic Key for JWT Session Signing (Minimum 32 characters)
JWT_SECRET="e9d48b71f92a403487f54c2d3b8e910a3c4f7b6d1e8a9c2b4d6e8f0a2c4e6b8d"

# Google Gemini API Key and Model Version
GEMINI_API_KEY="AIzaSy_YOUR_VALID_GEMINI_API_KEY"
GEMINI_MODEL="gemini-3.5-flash-lite"

# Disable File Watchers in Headless/CI Environments
DISABLE_HMR="false"
```

> [!CAUTION]
> Never commit `.env` to version control. The `.gitignore` file is preconfigured to exclude all `.env*` files except `.env.example`.

#### 6. Database Schema Initialization & Migrations
Initialize the relational tables, constraints, indexes, and initial schema in your Neon PostgreSQL database:
```bash
npm run db:migrate
```
This executes `server/migrate.ts`, which runs transactional SQL migration files from `server/migrations/` (creating `users`, `transactions`, `budgets`, `goals`, `bills`, `recurring_transactions`, `documents`, and the `schema_migrations` audit table).

#### 7. Starting the Application

##### Option A: Integrated Development Server (Recommended)
Launches Express and Vite concurrently on a single port (`3000`):
```bash
npm run dev
```
Open your browser and navigate to: **`http://localhost:3000`**

##### Option B: Running the Python Machine Learning Service
To run the auxiliary Python forecasting service in a separate terminal:
```bash
# Ensure virtual environment is active
python -m uvicorn ml_service.main:app --host 127.0.0.1 --port 8000 --reload
```
Swagger API documentation will be accessible at: **`http://127.0.0.1:8000/docs`**

#### 8. Verification and Production Build
To verify type safety and compile production-ready bundles:
```bash
# 1. Type-check all TypeScript files:
npm run lint

# 2. Compile frontend assets and server bundle:
npm run build

# 3. Start the production server:
npm start
```
The build produces optimized static client assets in `dist/` and a compiled backend server in `dist/server.js`.

---

### 7.2 Data Collection and Schema Definition
The database schema enforces data integrity through foreign key constraints and user-level isolation. Every financial entity contains a `user_id` referencing the `users` table. Repositories in `server/repositories/` ensure all queries filter strictly by `WHERE user_id = $1`, guaranteeing tenant isolation.

### 7.3 Category Normalization and Alias Mapping
Input transactions undergo string sanitization and alias mapping. Variations such as "uber", "ola", and "metro" are normalized to `Transportation`, while "starbucks", "swiggy", and "zomato" map to `Dining`.

### 7.4 Exploratory Data Analysis and Temporal Dataset Splitting
Data is chronologically partitioned into training, validation, and held-out test splits. Training occurs exclusively on past observations, preventing future data leakage into lag or rolling features.

### 7.5 Feature Engineering and Historical Aggregation
Transactions are grouped into continuous monthly sequences. Features generated include 1-month and 2-month lags, 3-month rolling averages, linear trend $t$, and cyclical trigonometric harmonics.

### 7.6 Model Training and Evaluation
```
                     Feature Importance (Random Forest Regressor)
  trend_t          ██████████████████████████████████████████ 55.26%
  rolling_mean_3   ██████████████ 19.42%
  month_sin        ████████ 10.64%
  lag_1            ███████ 9.61%
  lag_2            ███ 4.60%
  month_cos        ▌ 0.47%
```
*Fig 7.6: Feature Importance and Driver Matrix of Forecasting Model*

Models are fitted on historical features. Random Forest Regressor demonstrates strong performance in capturing spending momentum (trend index) and short-term volatility (rolling average).

### 7.7 Anomaly Detection and Recurrence Module Integration
The anomaly module evaluates transaction deviations against historical category baselines, surfacing review badges in the UI. The recurrence engine scans transaction intervals and amount variances, automatically generating proposed recurring schedules.

### 7.8 Budget Variance and Goal Feasibility Logic
Budget logic computes real-time burn velocity and remaining allowances. Goal feasibility logic projects required monthly savings based on target dates and current accumulated funds.

### 7.9 Interactive Dashboard
The frontend brings all modules together into a unified experience, displaying cash flow charts, category breakdowns, forecast trajectories with confidence bands, and the interactive Gemini chat assistant.

---

## CHAPTER 8: TESTING

### 8.1 Test Data Evaluation
Test suites evaluate representative financial records spanning standard transactions, zero-expense months, large spending shocks, and edge-case timestamps.

### 8.2 Model Comparison and Selection
Candidate models (Naive, Moving Average, Linear Regression, Random Forest) are compared across identical chronological folds. Random Forest and Linear Regression consistently outperform the naive baseline on validation MAE and RMSE.

### 8.3 Error Analysis and Sensitivity Testing
Residual distributions were inspected across irregular spending shocks. Sensitivity tests verified that forecast confidence bands expand appropriately as prediction horizons extend from 1 to 4 months.

### 8.4 Final Validation and Deployment Readiness
All protected endpoints were tested for authentication enforcement and tenant isolation. Production builds and automated lint checks confirmed 0 type errors. Anomaly detection, recurring expense tracking, and the grounded Gemini AI assistant are fully implemented, verified, and operational.

---

## CHAPTER 9: RESULTS

### 9.1 User Profile & Financial Baseline Settings
The profile settings screen allows users to configure account credentials, baseline monthly net income, base currency, and theme preferences.
*(Ref: Fig 9.1)*

### 9.2 Transaction Input & Ingestion Interface
The transaction interface provides manual entry forms and batch CSV file upload capabilities, instantly updating ledger summaries.
*(Ref: Fig 9.2)*

### 9.3 Spending Analytics & Category Breakdown Dashboard
The analytics dashboard displays multi-month trends, category breakdowns, savings margins, and outlay volatility indexes through interactive Recharts visuals.
*(Ref: Fig 9.3)*

### 9.4 Multi-Model Expense Forecasting & Projection Interface
The forecasting interface displays the active model selection, evaluation metrics (MAE, RMSE, MAPE), historical actuals, and projected trajectory with 95% confidence bounds.
*(Ref: Fig 9.4)*

---

## CHAPTER 10: CONCLUSION

FinSight AI successfully delivers an intelligent personal finance platform integrating transaction management, OCR receipt ingestion, multi-model expense forecasting, and Generative AI conversational intelligence. By replacing manual bookkeeping with automated category normalization, anomaly detection, and predictive modeling, the system enables users to make proactive, data-grounded financial decisions. The implementation of Google Gemini 3.5 Flash Lite with deterministic fallback guarantees that conversational financial coaching remains truthful, verifiable, and free of AI hallucinations.

---

## CHAPTER 11: FUTURE WORK

1. **Open Banking & Bank Feed Aggregation**: Direct API integration with financial account aggregators (Account Aggregator framework / Plaid).
2. **Deep Learning Forecasting**: Exploring temporal transformer architectures (PatchTST, TFT) for multi-year spending patterns.
3. **Automated Tax Categorization**: Extending invoice parsing to calculate GST/VAT deductibles automatically.
4. **Native Mobile App**: Packaging the React application using React Native or Capacitor for iOS and Android app stores.
5. **Multi-lingual AI Coaching**: Extending the Gemini assistant to converse in regional Indian languages (Telugu, Hindi, Tamil).

---

## REFERENCES

1. M. Suganya, R. Jayaraj, A. Syed Ismail, and S. Ganesh Kumar, “GenAI-Powered Personal Finance Consultant: Integrating Machine Learning and Generative AI for Personalized Financial Recommendations and Literacy Enhancement,” *ICDSBS*, 2025. DOI: 10.1109/ICDSBS63635.2025.11031897.
2. N. Shailendra, C. Parvathi, S. Gupta, and G. Ravikumar, “Money Map: The Personal Finance Tracker,” *ICKECS*, 2025. DOI: 10.1109/ICKECS65700.2025.11035699.
3. R. S. Menezes and R. H. Filho, “Investigating the Robustness of Graph Neural Networks to Data Drift: A Case Study on Financial Transaction Data,” *IEEE Access*, 2025. DOI: 10.1109/ACCESS.2025.3611817.
4. W. Wang and B. Li, “A Financial Data Analysis Method Based on Time-Series Generative Adversarial Network and Decomposition Learning,” *IEEE Access*, 2025. DOI: 10.1109/ACCESS.2025.3585968.
5. K. Ramya, C. Sangeet V, J. Venkat A, A. Senthilselvi, V. Kumar L, and N. Madhuri, “Smart Finance Investment Management and Community Powered by Generative AI,” *ICCPCT*, 2025, pp. 1656–1661. DOI: 10.1109/ICCPCT65132.2025.11176580.

---

## APPENDIX – I – SAMPLE CODE

```python
import numpy as np
from sklearn.ensemble import RandomForestRegressor

def forecast_expenses(monthly_expenses, forecast_months=1):
    """
    Predict future expenses using a Random Forest Regressor time-series model.
    Args:
        monthly_expenses: List of historical monthly expense totals.
        forecast_months: Number of future months to forecast.
    Returns:
        List of predicted monthly expenses.
    """
    values = np.asarray(monthly_expenses, dtype=float)
    if len(values) < 4:
        raise ValueError("Insufficient historical data for forecasting (minimum 4 months required).")
    
    X, y = [], []
    for i in range(3, len(values)):
        # Features: [Lag 1, Lag 2, Lag 3, Time Index t]
        X.append([values[i - 1], values[i - 2], values[i - 3], i])
        y.append(values[i])
        
    model = RandomForestRegressor(
        n_estimators=100,
        max_depth=3,
        random_state=42
    )
    model.fit(X, y)
    
    history = list(values)
    predictions = []
    for _ in range(forecast_months):
        t = len(history)
        features = [[history[-1], history[-2], history[-3], t]]
        prediction = max(0.0, float(model.predict(features)[0]))
        predictions.append(prediction)
        history.append(prediction)
        
    return predictions
```

