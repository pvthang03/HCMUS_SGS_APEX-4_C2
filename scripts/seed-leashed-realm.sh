#!/usr/bin/env bash
# Seed the Leashed roles and council users into the realm, then print one Tide invite link per user.
#
# Run it WHILE scripts/bootstrap-tidecloak.sh is waiting at its invite-link step (realm still in
# firstAdmin mode): the bootstrap's next step approves and commits every pending change request,
# including the ones created here. After the realm flips to multiAdmin, the same changes would
# need an enclave approval in the TideCloak console instead.
set -euo pipefail
[ -f .env ] && { set -a; . ./.env; set +a; }
TC="${TIDECLOAK_URL:-http://localhost:8080}"
REALM="${REALM_NAME:-leashed}"
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set it in .env}"

token() {
  curl -s -X POST "$TC/realms/master/protocol/openid-connect/token" \
    --data-urlencode "username=${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" \
    --data-urlencode "password=$KC_BOOTSTRAP_ADMIN_PASSWORD" \
    -d "grant_type=password&client_id=admin-cli" | jq -r .access_token
}
api() { curl -s -X "$1" "$TC/admin/realms/$REALM$2" -H "Authorization: Bearer $(token)" -H "Content-Type: application/json" ${3:+-d "$3"}; }

approve_pending() {
  for pass in 1 2 3; do
    for id in $(api GET "/iga/change-requests?status=PENDING" | jq -r 'if type=="array" then .[].id else empty end'); do
      api POST "/iga/change-requests/$id/authorize" '{}' >/dev/null || true
    done
    for id in $(api GET "/iga/change-requests?status=PENDING" | jq -r 'if type=="array" then (.[] | select(.readyToCommit==true) | .id) else empty end'); do
      api POST "/iga/change-requests/$id/commit" >/dev/null || true
    done
  done
}

echo "==> Realm roles"
for r in approver moderator member; do
  api POST "/roles" "{\"name\":\"$r\",\"description\":\"Leashed $r\"}" >/dev/null
done
approve_pending

echo "==> Council users"
for u in ari bob cleo; do
  api POST "/users" "{\"username\":\"$u\",\"enabled\":true,\"email\":\"$u@guild.invalid\",\"firstName\":\"${u^}\",\"lastName\":\"Council\",\"attributes\":{\"tideInvitable\":[\"true\"]}}" >/dev/null
done
approve_pending
# Users created by an earlier run without the attribute: set it (also a governed change).
for u in ari bob cleo; do
  uid=$(api GET "/users?username=$u&exact=true" | jq -r '.[0].id')
  rep=$(api GET "/users/$uid" | jq -c '.attributes = ((.attributes // {}) + {"tideInvitable":["true"]})')
  api PUT "/users/$uid" "$rep" >/dev/null
done
approve_pending

grant() { # user role
  local uid role
  uid=$(api GET "/users?username=$1&exact=true" | jq -r '.[0].id')
  role=$(api GET "/roles/$2")
  api POST "/users/$uid/role-mappings/realm" "[$role]" >/dev/null
}
for u in ari bob cleo; do grant "$u" approver; done
grant admin moderator
approve_pending

echo "==> Pending change requests left: $(api GET "/iga/change-requests?status=PENDING" | jq 'if type=="array" then length else . end')"
echo
echo "Open each link in its own private/incognito window and create a Tide account for that person:"
for u in ari bob cleo; do
  uid=$(api GET "/users?username=$u&exact=true" | jq -r '.[0].id')
  link=$(api POST "/tideAdminResources/get-required-action-link?userId=$uid&lifespan=43200" '["link-tide-account-action"]')
  echo "  $u: $link"
done
