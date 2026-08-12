# Clerk administrator access

OpenSymbols uses one backend-managed Clerk public metadata value as the source
of truth for administrator access:

```json
{
  "administrator": true
}
```

In the Clerk Dashboard, open **Sessions**, then **Customize session token**, and
add only the narrow claim below. Do not project the complete metadata object.

```json
{
  "administrator": "{{user.public_metadata.administrator}}"
}
```

Clerk preserves the metadata value's JSON type when it substitutes the
shortcode. Hono grants access only when the verified claim is the boolean
`true`; missing, false, string, numeric, and malformed values are denied.

See Clerk's official guidance for [customizing a session
token](https://clerk.com/docs/guides/sessions/customize-session-tokens) and
[using public metadata for basic
RBAC](https://clerk.com/docs/guides/secure/basic-rbac).

## Grant access

1. A current OpenAAC Clerk administrator confirms the person's identity and
   that administrator access has been approved through the team's normal
   decision process.
2. In the production Clerk instance, open the user and set the public metadata
   `administrator` value to the JSON boolean `true`.
3. Record who approved and performed the change, the Clerk user ID, the time,
   and the reason in the organization's restricted operations log. Do not copy
   the person's profile into the OpenSymbols database.
4. Revoke the person's existing Clerk sessions or ask them to sign out and back
   in. Verify that `/api/app/session` reports `administrator: true` before they
   begin work.

## Revoke access

1. Remove `administrator`, or set it to the JSON boolean `false`, in the user's
   public metadata.
2. Revoke every active Clerk session for the user immediately. Metadata changes
   do not alter an already-issued session token until it refreshes.
3. Record the actor, Clerk user ID, time, and reason in the restricted
   operations log.
4. Confirm a newly issued session reports `administrator: false` and that an
   administrator API returns `403`.

Deleting or disabling only the browser navigation is never a revocation. Hono
is the authorization boundary for every `/api/app/admin/*` request.

## Recovery and incidents

- Maintain at least two organization-controlled Clerk administrators with MFA
  and tested recovery access.
- If an administrator account or session may be compromised, revoke all of its
  sessions first, remove the metadata flag, and then follow Clerk account
  recovery. Do not wait for token expiry.
- If the last normal administrator is unavailable, a designated OpenAAC
  recovery owner may use the Clerk Dashboard to grant a time-limited recovery
  administrator. Record and remove that access after the incident.
- Administrator audit records use the verified Clerk `sub` as the actor ID.
  Email addresses, names, and avatars are not synchronized to PostgreSQL.

The React interface may hide administrator navigation for ordinary users, but
that is presentational only. Missing or invalid sessions receive `401`, verified
non-administrators receive `403`, and unavailable Clerk verification receives
`503` from the server boundary.
