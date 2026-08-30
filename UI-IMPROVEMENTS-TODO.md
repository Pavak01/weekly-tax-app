# UI Improvements To-Do List

## Priority: High

### 1. Account Deletion Form Polish
- [ ] Add confirmation dialog before submitting deletion request
- [ ] Show "Request submitted" confirmation screen with next steps
- [ ] Add loading state while submitting
- [ ] Better error messaging for common failure cases
- [ ] Link to FAQ/help explaining the 30-day deletion timeline

### 2. Settings Screen Enhancement
- [ ] Add section headers/organization (Account, Data, Legal, App Info)
- [ ] Visual separation between destructive actions (clear data, delete account)
- [ ] Confirmation modal for "Clear All Data" action
- [ ] Show account status/deletion status if pending

### 3. Form UX Improvements
- [ ] Consistent error styling across all forms
- [ ] Clear visual feedback for required vs optional fields
- [ ] Character count display for message fields
- [ ] Keyboard dismiss on form submit
- [ ] Better placeholder text guidance

## Priority: Medium

### 4. Navigation & Hierarchy
- [ ] Breadcrumb or back button consistency
- [ ] Screen transition animations
- [ ] Bottom nav bar better visual feedback on active tab
- [ ] Hamburger menu icon consistency

### 5. Data Display
- [ ] Loading skeletons for entry lists
- [ ] Better empty state messages (more contextual)
- [ ] Pagination or infinite scroll for long lists
- [ ] Filter/search for entries by date range

### 6. Receipts Management
- [ ] Receipt preview on tap
- [ ] Delete receipt functionality with confirmation
- [ ] Bulk delete receipts option
- [ ] Receipt upload progress indicator

### 7. Accessibility
- [ ] Increase min touch target size to 48x48 dp
- [ ] Improve color contrast ratios
- [ ] Add focus states for keyboard navigation
- [ ] Screen reader labels on all interactive elements

## Priority: Low

### 8. Visual Polish
- [ ] Consistent icon set throughout app
- [ ] Improve button hover/pressed states
- [ ] Refine spacing and padding alignment
- [ ] Shadow and elevation consistency

### 9. Onboarding
- [ ] First-time user welcome screen
- [ ] Quick tutorial for tax entry creation
- [ ] Explain what each section does
- [ ] Feature discovery hints

### 10. Performance UX
- [ ] Skeleton loaders for slow operations
- [ ] Network error retry UI
- [ ] Offline mode indication
- [ ] Sync status indicator

## Completed (v72)
- ✅ Empty states for Summary, Audit, Export screens
- ✅ Button state feedback (pressed/disabled)
- ✅ Privacy Policy link in Guide screen
- ✅ Account deletion link (now functional as of v80)
- ✅ UI polish for navigation

## Testing Checklist
- [ ] Test all forms on small screens (5" devices)
- [ ] Test all forms on large screens (7"+ tablets)
- [ ] Verify color contrast with accessibility checker
- [ ] Test keyboard navigation
- [ ] Test with screen reader
- [ ] Test on slow network (3G simulation)
- [ ] Verify touch target sizes

## Notes
- Account deletion form is now functional (v80+)
- Consider A/B testing confirmation dialogs vs direct submission
- Prioritize based on user feedback/analytics
- Test changes on both mobile/ and mobile-release/ versions
