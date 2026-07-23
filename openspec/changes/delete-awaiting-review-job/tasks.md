## 1. Backend: allow cancelling AWAITING_REVIEW jobs

- [x] 1.1 In `JobLifecycleService.cancelJob`, extend the status guard to accept both `QUEUED` and `AWAITING_REVIEW` (throw 409 for all other statuses)

## 2. Frontend: delete button in review screen

- [x] 2.1 In `ReviewComponent`, add a "Delete" button to each job card header that calls `api.cancelJob(job.id)`
- [x] 2.2 Disable the delete button while a cancellation request is in flight (use a per-job deleting signal or set)
- [x] 2.3 Add i18n key `review.deleteJob` (and translations) for the button label
