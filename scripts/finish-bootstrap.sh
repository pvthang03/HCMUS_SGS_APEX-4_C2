#!/usr/bin/env bash
# Finish a bootstrap whose script stopped at the invite-link step (e.g. the codespace restarted).
# Runs bootstrap-tidecloak.sh steps 9-11: approve pending change requests, sign the Tide IdP
# settings, grant tide-realm-admin to `admin` (flips the realm to multiAdmin), export the adapter.
# Run it only after EVERY council user (ari, bob, cleo) and admin has linked a Tide account:
# after the multiAdmin flip, new links need an enclave approval in the TideCloak console.
set -euo pipefail
[ -f .env ] && { set -a; . ./.env; set +a; }
TC="${TIDECLOAK_URL:-http://localhost:8080}"
REALM="${REALM_NAME:-leashed}"
CLIENT="${CLIENT_NAME:-leashed-client}"
: "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set it in .env}"

token() {
  curl -s -X POST "$TC/realms/master/protocol/openid-connect/token" \
    --data-urlencode "username=${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" \
    --data-urlencode "password=$KC_BOOTSTRAP_ADMIN_PASSWORD" \
    -d "grant_type=password&client_id=admin-cli" | jq -r .access_token
}
api() { curl -s -X "$1" "$TC/admin/realms/$REALM$2" -H "Authorization: Bearer $(token)" -H "Content-Type: application/json" ${3:+-d "$3"}; }

approve_pending() {
  local skip='select(.actionType | IN("DISABLE_IGA","DELETE_REALM","OFFBOARD_REALM") | not)'
  for pass in 1 2 3 4 5; do
    for id in $(api GET "/iga/change-requests?status=PENDING" | jq -r "if type==\"array\" then (.[] | $skip | .id) else empty end"); do
      api POST "/iga/change-requests/$id/authorize" '{}' >/dev/null || true
    done
    ready=$(api GET "/iga/change-requests?status=PENDING" | jq -r "if type==\"array\" then (.[] | $skip | select(.readyToCommit==true) | .id) else empty end")
    [ -z "$ready" ] && break
    for id in $ready; do api POST "/iga/change-requests/$id/commit" >/dev/null || true; done
  done
}

echo "==> Linked Tide accounts:"
api GET "/users" | jq -r '.[] | "    \(.username): \(if .attributes.tideUserKey[0] then "linked" else "NOT linked" end)"'
ADMIN_ID=$(api GET "/users?username=admin&exact=true" | jq -r '.[0].id')
if [ -z "$(api GET "/users/$ADMIN_ID" | jq -r '.attributes.tideUserKey[0] // empty')" ]; then
  echo "ERROR: admin has not linked a Tide account yet. Open its invite link first." >&2
  exit 1
fi

echo "==> Approving pending change requests..."
approve_pending

echo "==> Signing Tide IdP settings..."
CONSOLE="${TIDECLOAK_PUBLIC_URL:-$TC}/realms/$REALM/tide-console/"
INST=$(api GET "/identity-provider/instances/tide")
api PUT "/identity-provider/instances/tide" "$(echo "$INST" | jq -c --arg d "$CONSOLE" '.config.CustomAdminUIDomain=$d')" >/dev/null
api POST "/vendorResources/sign-idp-settings" >/dev/null

echo "==> Granting tide-realm-admin to admin (realm becomes multiAdmin)..."
RM=$(api GET "/clients?clientId=realm-management" | jq -r '.[0].id')
ROLE=$(api GET "/clients/$RM/roles/tide-realm-admin")
api POST "/users/$ADMIN_ID/role-mappings/clients/$RM" "[$ROLE]" >/dev/null
sleep 2
approve_pending

echo "==> Exporting adapter..."
CU=$(api GET "/clients?clientId=$CLIENT" | jq -r '.[0].id')
api GET "/vendorResources/get-installations-provider?clientId=$CU&providerId=keycloak-oidc-keycloak-json" > data/tidecloak.json
jq -e '.jwk.keys[0]' data/tidecloak.json >/dev/null
cp data/tidecloak.json public/tidecloak.json
echo "XONG / DONE: setup finished. Now run: npm run dev"
