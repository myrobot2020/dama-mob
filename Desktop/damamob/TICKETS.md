# DAMA Project Tickets

## 🟢 ACTIVE

### 1. Physical Device Validation
- **Goal**: Transition testing from emulator/desktop to a physical Android device.
- **Tasks**:
  - Connect device via USB debugging.
  - Verify layout on physical notch/cutouts (Safe Area).
  - Test touch targets for fingers vs. mouse pointers.
  - Verify performance of leaf animations on mobile hardware.

### 2. Make Tree Functionality Work
- **Goal**: Ensure the "Leaf" system (Grey -> Green -> Yellow -> Gold) is fully operational and persisting.
- **Current Status**: UI exists in `/tree`, but state logic needs verification.
- **Tasks**:
  - Verify `localStorage` persistence for `dama:leaves`.
  - Ensure tapping a leaf correctly transitions to the `Quiz` for that specific sutta.
  - Implement/Verify the "decay" logic (Green to Yellow).
  - Ensure the "Gold" state is achievable via the review quiz.
  - Link Tree progress to Supabase `quiz_results` table for cross-device sync.

---

## ⚪ BACKLOG
- Onboarding auto-redirect.
- Dhamma Flow Watcher integration.
- Offline support (PWA).
