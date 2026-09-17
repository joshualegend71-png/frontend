# Expense Tracker Frontend

A clean, responsive web frontend for the ExpenseTracker API. Built with plain HTML, CSS, and JavaScript.

## Features

### Core Features
- **View Expenses**: See all expenses with amount, category, and date displayed in a clean table
- **Add Expense**: Form with validation to add new expenses
- **Delete Expense**: Confirmation modal before deleting
- **Running Total**: Displays total spent from the backend
- **Empty State Handling**: Friendly message when no expenses exist
- **Error Handling**: Graceful error messages with retry functionality

### Extra Features
- **Edit Expenses**: Click edit to modify an existing expense
- **Currency Formatting**: Amounts displayed as Nigerian Naira (₦) with thousands separators
- **Date Sorting**: Expenses sorted by date (newest first)
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Toast Notifications**: Success/error feedback for all actions
- **Loading States**: Spinner while data is being fetched
- **Form Validation**: Client-side validation prevents invalid submissions
- **XSS Protection**: All user input is properly escaped

## Prerequisites

1. The ExpenseTracker API must be running
2. By default, the frontend expects the API at `http://localhost:5267/api/expenses`

## How to Run

### Option 1: Open directly in browser
Simply open `index.html` in your web browser.

### Option 2: Use a simple HTTP server
```bash
# Using Python
python -m http.server 8080

# Using Node.js (npx)
npx serve

# Using .NET
dotnet tool install -g Microsoft.Web.LibraryManager.Cli
```

Then open `http://localhost:8080` in your browser.

## Configuration

The API base URL is chosen automatically based on where the page is loaded from (see the top of `app.js`):

- `localhost` / `127.0.0.1` → the local API at `https://localhost:7109`
- anywhere else (the published site) → the published API at `https://joelegend.runasp.net`

To point at a different API, edit `API_ROOT` in `app.js`.

## File Structure

```
frontend/
├── index.html    # Main HTML structure
├── styles.css    # All styling (responsive, modern design)
├── app.js        # JavaScript application logic
└── README.md     # This file
```

## Usage

1. **Add an Expense**:
   - Fill in the Amount (must be > 0)
   - Select a Category
   - Optionally add a Date (defaults to today) and Description
   - Click "Add Expense"

2. **View Expenses**:
   - All expenses appear in the table below the form
   - Sorted by date (newest first)
   - Total spent is shown in the header

3. **Edit an Expense**:
   - Click the "Edit" button on any expense row
   - Form populates with the expense data
   - Make changes and click "Update Expense"
   - Click "Cancel" to abort editing

4. **Delete an Expense**:
   - Click the "Delete" button on any expense row
   - Confirm deletion in the modal
   - Expense is removed and list refreshes

## API Endpoints Used

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/expenses` | Get all expenses |
| GET | `/api/expenses/summary` | Get total spent |
| POST | `/api/expenses` | Create new expense |
| PUT | `/api/expenses/{id}` | Update expense |
| DELETE | `/api/expenses/{id}` | Delete expense |

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Error Handling

The frontend handles various error scenarios:

- **API Unavailable**: Shows "Unable to connect to the server" message with retry button
- **Validation Errors**: Inline error messages for invalid form inputs
- **Server Errors**: Toast notifications with error details
- **Network Errors**: Graceful fallback with user-friendly messages

## Design Decisions

1. **Plain JavaScript**: No frameworks or dependencies - just vanilla JS
2. **Service Pattern**: Clean separation between API, UI, and application logic
3. **State Management**: Simple in-memory state for expenses
4. **Accessibility**: Keyboard navigation support (Escape to close modal)
5. **Mobile-First**: Responsive design that works on all screen sizes