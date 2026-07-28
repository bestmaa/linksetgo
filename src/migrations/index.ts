import * as migration_20260726_135214_initial_relay_schema from './20260726_135214_initial_relay_schema'
import * as migration_20260727_054612_tenant_foundation from './20260727_054612_tenant_foundation'
import * as migration_20260727_060857_domain_foundation from './20260727_060857_domain_foundation'
import * as migration_20260727_064317_cloud_signup from './20260727_064317_cloud_signup'
import * as migration_20260727_070251_billing_quotas from './20260727_070251_billing_quotas'
import * as migration_20260727_072601_invitations_security_controls from './20260727_072601_invitations_security_controls'
import * as migration_20260727_083039_final_product_foundation from './20260727_083039_final_product_foundation'

export const migrations = [
  {
    up: migration_20260726_135214_initial_relay_schema.up,
    down: migration_20260726_135214_initial_relay_schema.down,
    name: '20260726_135214_initial_relay_schema',
  },
  {
    up: migration_20260727_054612_tenant_foundation.up,
    down: migration_20260727_054612_tenant_foundation.down,
    name: '20260727_054612_tenant_foundation',
  },
  {
    up: migration_20260727_060857_domain_foundation.up,
    down: migration_20260727_060857_domain_foundation.down,
    name: '20260727_060857_domain_foundation',
  },
  {
    up: migration_20260727_064317_cloud_signup.up,
    down: migration_20260727_064317_cloud_signup.down,
    name: '20260727_064317_cloud_signup',
  },
  {
    up: migration_20260727_070251_billing_quotas.up,
    down: migration_20260727_070251_billing_quotas.down,
    name: '20260727_070251_billing_quotas',
  },
  {
    up: migration_20260727_072601_invitations_security_controls.up,
    down: migration_20260727_072601_invitations_security_controls.down,
    name: '20260727_072601_invitations_security_controls',
  },
  {
    up: migration_20260727_083039_final_product_foundation.up,
    down: migration_20260727_083039_final_product_foundation.down,
    name: '20260727_083039_final_product_foundation',
  },
]
