# Security Specification

## 1. Data Invariants
- `userId` path variable must match the authenticated `request.auth.uid`.
- Only verified accounts (`request.auth.token.email_verified == true`) are allowed write operations.
- Admin access is strictly governed by the `admins/{userId}` collection. Only an existing admin can write to the `admins` collection.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Read:** Client tries to read `users/{userId}` without logging in.
2. **Anonymous Write:** Unauthenticated client tries to create `users/123`.
3. **Ghost Field Injection:** Client tries to create a user with an unlisted field (e.g. `isSuperuser`).
4. **Spoofed Identity:** Client tries to create `users/{otherUserId}` while logged in as `userId`.
5. **Role Escalation:** Client tries to add themselves to `admins/{userId}` collection.
6. **Type mismatch:** Modifying `email` to a boolean.
7. **Size limits:** Sending a 2MB string as `email`.
8. **Malicious ID:** Using a 2MB string as `userid`.
9. **Missing Required Fields:** Creating User without `createdAt`.
10. **Spoofed Timestamp:** Setting `createdAt` to a timestamp in the past instead of `request.time`.
11. **Admin Removal:** Non-admin tries to delete an admin from `admins/{userId}`.
12. **PII Blanket Read:** Reading all users in `users/` collection.

## 3. The Test Runner
A subsequent `firestore.rules.test.ts` file verifies these.
