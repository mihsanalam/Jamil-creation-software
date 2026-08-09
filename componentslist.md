# In here we have Full component list, mapped to what it's for

Component	Used for
button	    Every screen — primary actions, form submits
input	    Every form (fabric intake, login, add client, add user)
label	    Paired with every input
form	    All forms — validation via react-hook-form
textarea	Description/process notes (fabric intake), notes(phasedetail)
select	    Dropdowns — unit (meters/kg), role, product type,payment method
card	Dashboard metric cards, batch summary cards, invoice card
table	User list, batch list, sales report, warehouse search results
badge	Status pills — role badges, phase status, paid/due, wholesale/  retail
dialog	Add client modal, add user modal, confirmations
dropdown-menu	Row actions (Edit/Deactivate), filter menus
tabs	Sales & dues report ("All sales" / "Clients with dues")
calendar + popover	Date picker — date received, date-range filter
command	Searchable dropdowns — fabric batch search, barcode/product search, client search
separator	Visual dividers in forms and cards
sonner	Toast notifications — "Sale completed," "Batch saved"
alert	Bottleneck warning banner, low-stock warning
switch	"Paid in full" vs "Wholesale credit" toggle
radio-group	Alternative to switch if you want the paid/due choice as radio buttons instead
tooltip	Hints on icons (drag handle, remove step)
scroll-area	Horizontal scroll on the Kanban/Phase board
skeleton	Loading states while data fetches (pairs with your SWR polling)
chart	Small sales trend chart on the Sales & Dues report