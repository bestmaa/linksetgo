import * as migration_20260726_135214_initial_relay_schema from './20260726_135214_initial_relay_schema'
import * as migration_20260727_054612_tenant_foundation from './20260727_054612_tenant_foundation'
import * as migration_20260727_060857_domain_foundation from './20260727_060857_domain_foundation'
import * as migration_20260727_064317_cloud_signup from './20260727_064317_cloud_signup'
import * as migration_20260727_070251_billing_quotas from './20260727_070251_billing_quotas'
import * as migration_20260727_072601_invitations_security_controls from './20260727_072601_invitations_security_controls'
import * as migration_20260727_083039_final_product_foundation from './20260727_083039_final_product_foundation'
import * as migration_20260730_120636_shared_free_links_and_fallback_safety from './20260730_120636_shared_free_links_and_fallback_safety'
import * as migration_20260730_134938_fallback_origin_dns_freshness from './20260730_134938_fallback_origin_dns_freshness'
import * as migration_20260730_142500_distributed_auth_rate_limits from './20260730_142500_distributed_auth_rate_limits'
import * as migration_20260730_152807_account_recovery_outbox from './20260730_152807_account_recovery_outbox'

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
  {
    up: migration_20260730_120636_shared_free_links_and_fallback_safety.up,
    down: migration_20260730_120636_shared_free_links_and_fallback_safety.down,
    name: '20260730_120636_shared_free_links_and_fallback_safety',
  },
  {
    up: migration_20260730_134938_fallback_origin_dns_freshness.up,
    down: migration_20260730_134938_fallback_origin_dns_freshness.down,
    name: '20260730_134938_fallback_origin_dns_freshness',
  },
  {
    up: migration_20260730_142500_distributed_auth_rate_limits.up,
    down: migration_20260730_142500_distributed_auth_rate_limits.down,
    name: '20260730_142500_distributed_auth_rate_limits',
  },
  {
    up: migration_20260730_152807_account_recovery_outbox.up,
    down: migration_20260730_152807_account_recovery_outbox.down,
    name: '20260730_152807_account_recovery_outbox',
  },
]
