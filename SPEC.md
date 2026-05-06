# Personal Finance Tracker - Specification

## Project Overview
- **Project Name**: FinTrack - Personal Finance Manager
- **Type**: Single-page Web Application
- **Core Functionality**: Track income/expenses with analytics, charts, and budget management
- **Target Users**: Individuals wanting to manage personal finances daily

## UI/UX Specification

### Layout Structure
- **Header**: Logo, app title, dark mode toggle, export/import buttons
- **Main Grid**: 2-column on desktop (sidebar + content), 1-column on mobile
- **Sidebar**: Navigation, quick stats summary, add transaction button
- **Content Area**: Dashboard (cards), Transaction list, Charts, Filters
- **Modal**: Transaction form (add/edit)

### Responsive Breakpoints
- Mobile: < 768px (single column, stacked layout)
- Tablet: 768px - 1024px (2 columns, compact sidebar)
- Desktop: > 1024px (full layout with sidebar)

### Visual Design

#### Color Palette (Light Mode)
- **Background**: #F8FAFC (slate-50)
- **Surface**: #FFFFFF
- **Primary**: #10B981 (emerald-500) - accent color
- **Primary Hover**: #059669 (emerald-600)
- **Secondary**: #6366F1 (indigo-500) - for income
- **Danger**: #EF4444 (red-500) - for expenses/delete
- **Text Primary**: #1E293B (slate-800)
- **Text Secondary**: #64748B (slate-500)
- **Border**: #E2E8F0 (slate-200)
- **Success**: #22C55E (green-500)
- **Warning**: #F59E0B (amber-500)

#### Color Palette (Dark Mode)
- **Background**: #0F172A (slate-900)
- **Surface**: #1E293B (slate-800)
- **Primary**: #10B981 (emerald-500)
- **Text Primary**: #F1F5F9 (slate-100)
- **Text Secondary**: #94A3B8 (slate-400)
- **Border**: #334155 (slate-700)

#### Typography
- **Font Family**: 'DM Sans', sans-serif (Google Fonts)
- **Headings**:
  - H1: 28px, weight 700
  - H2: 22px, weight 600
  - H3: 18px, weight 600
- **Body**: 14px, weight 400
- **Small**: 12px, weight 400
- **Numbers/Amounts**: 'JetBrains Mono', monospace

#### Spacing System
- Base unit: 4px
- XS: 4px, SM: 8px, MD: 16px, LG: 24px, XL: 32px, XXL: 48px

#### Visual Effects
- **Border Radius**: 8px (cards), 6px (buttons), 4px (inputs)
- **Box Shadow (Light)**: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)
- **Box Shadow (Elevated)**: 0 10px 15px -3px rgba(0,0,0,0.1)
- **Transitions**: 200ms ease-out for all interactive elements
- **Animations**: Fade-in for modals (scale + opacity), slide for list items

### Components

#### Dashboard Cards
- Total Balance: Large number, positive (green) / negative (red) indicator
- Total Income: Green accent bar on left
- Total Expenses: Red accent bar on left
- Monthly Budget: Progress bar with percentage

#### Transaction List Item
- Icon (category-based), Description, Category label, Date, Amount
- Hover: Edit/Delete icons appear on right
- Swipe on mobile: Delete action

#### Charts
- Bar Chart: 6 months, grouped bars (income/expense), legend
- Pie Chart: Categories with labels, hover tooltips, legend
- Custom built with HTML/CSS/JS (canvas not used)

#### Form Inputs
- Clean borders, focus ring with primary color
- Validation states: error (red border + message), success (green check)
- Floating labels or top-aligned labels

#### Buttons
- Primary: Solid emerald background, white text
- Secondary: Outline with border
- Icon buttons: 32x32, rounded, subtle background on hover

#### Modal
- Centered overlay with backdrop blur
- Close button (X) in top right
- Form sections clearly divided

## Functionality Specification

### Core Features

#### 1. Transaction Management
- **Add Transaction**: Modal form with fields:
  - Amount (number, required, > 0)
  - Type: Radio button (Income/Expense), default: Expense
  - Category: Dropdown with predefined + custom option
  - Description: Text input (optional, max 100 chars)
  - Date: Date picker, default: today
- **Predefined Categories**:
  - Income: Salary, Freelance, Investment, Gift, Other
  - Expense: Food, Transport, Housing, Utilities, Entertainment, Shopping, Health, Education, Other
- **Edit Transaction**: Same form, pre-filled, update in place
- **Delete Transaction**: Confirmation prompt, remove with animation

#### 2. Dashboard
- Calculate and display:
  - Total Balance = sum(income) - sum(expenses)
  - Total Income (all time)
  - Total Expenses (all time)
  - Current month summary
- Budget progress bar: (month expenses / monthly limit) * 100

#### 3. Data Analysis
- **Category Breakdown**: Group expenses by category, calculate percentages
- **Income vs Expense Ratio**: Total income / Total expenses
- **Monthly Summaries**: Group by month, show income, expenses, balance for each
- **Spending Trends**: Compare last 3 months

#### 4. Charts (Custom Implementation)
- **Bar Chart**: Monthly income vs expenses (last 6 months)
  - X-axis: Month names
  - Y-axis: Amount
  - Two bars per month (green for income, red for expenses)
  - Hover: Show exact values
- **Pie Chart**: Expenses by category (current month)
  - Segments sized by amount
  - Labels with category name + percentage
  - Hover: Highlight segment, show amount
  - Legend below chart

#### 5. Filters
- **Date Range**: Start date and end date inputs
- **Type**: Dropdown (All, Income, Expense)
- **Category**: Dropdown (All + all categories)
- **Apply button**: Filters transaction list in real-time
- **Clear filters**: Reset to show all

#### 6. Budget System
- Set monthly budget limit (stored in localStorage)
- Visual indicator when approaching limit (>80%)
- Warning when exceeded (red color)
- Reset option for new month

#### 7. Wallet Management
- **Add Wallet**: Modal form with fields:
  - Name (text, required)
  - Type: Dropdown (Virtual, Física, Banco, Broker)
  - Bank Type (only shown if type is Banco): Caja de Ahorro, Plazo Fijo
  - Currency: Dropdown (ARS, USD)
  - Initial Balance: Number (can be 0)
- **Edit Wallet**: Same form, pre-filled with wallet data
- **Delete Wallet**: Confirmation prompt, removes wallet but keeps associated transactions
- **Wallet Types**:
  - Virtual (purple indicator) - e.g., Mercado Pago, Prex
  - Physical (amber indicator) - e.g., Cash, Bank account
  - Bank (blue indicator) - e.g., BBVA, Santander
    - Caja de Ahorro: Standard bank account
    - Plazo Fijo: Term deposit with balance update modal
  - Broker (pink indicator) - e.g., BullMarket, broker accounts
- **Bank/Plazo Fijo Special Feature**: Plazo Fijo wallets can update balance anytime with percentage change display (same as brokers)
- **Broker Special Feature**: Can update balance anytime to reflect investment value without affecting income/expense calculations
- **Currency Support**:
  - ARS wallets: Summed in total balance
  - USD wallets: Show equivalent in ARS but NOT added to total
- **Empty State**: Shows message prompting user to add first wallet

### Data Handling

#### localStorage Schema
```javascript
{
  "fintrack_transactions": [
    {
      "id": "uuid",
      "amount": 1000,
      "type": "income" | "expense",
      "category": "Salary",
      "description": "Monthly salary",
      "date": "2024-01-15",
      "walletId": "wallet_id" | null,
      "transferGroupId": "transfer_uuid" | null,
      "transferType": "in" | "out" | null,
      "createdAt": "timestamp"
    }
  ],
  "fintrack_wallets": [
    {
      "id": "wallet_id",
      "name": "Wallet Name",
      "type": "virtual" | "physical" | "broker",
      "currency": "ARS" | "USD",
      "balance": 1000.00
    }
  ],
  "fintrack_settings": {
    "monthlyBudget": 2000,
    "darkMode": false,
    "currency": "ARS"
  }
}
```

### User Interactions
- Click "Add Transaction" → Open modal
- Fill form → Validate → Save → Close modal → Update UI
- Click edit icon → Open modal with data → Update → Save
- Click delete → Confirm → Remove with animation
- Toggle dark mode → Instant switch, persist preference
- Filter change → Debounced update of list
- Chart hover → Show tooltip with details

### Edge Cases
- Empty state: Show illustration + "No transactions yet" message
- No transactions in filter: Show "No matching transactions"
- Invalid form: Highlight errors, prevent submission
- Large numbers: Format with commas (1,000,000)
- Very long description: Truncate with ellipsis in list
- Date in future: Allow but show warning indicator
- Negative amount: Convert to positive automatically

## Acceptance Criteria

### Visual Checkpoints
- [ ] App loads with clean dashboard showing 3 stat cards
- [ ] Sidebar shows navigation and "Add Transaction" button
- [ ] Transaction list displays with proper formatting
- [ ] Charts render with correct data visualization
- [ ] Dark mode toggle works and persists
- [ ] Modal opens/closes smoothly
- [ ] Responsive: stacks properly on mobile

### Functional Checkpoints
- [ ] Can add new transaction with all fields
- [ ] Can edit existing transaction
- [ ] Can delete transaction with confirmation
- [ ] Transactions persist after page reload
- [ ] Dashboard numbers calculate correctly
- [ ] Filters work for date range, type, category
- [ ] Charts update when data changes
- [ ] Budget progress shows correctly
- [ ] Export downloads JSON file
- [ ] Import loads data from JSON file
- [ ] Empty states display properly
- [ ] Form validation prevents invalid data