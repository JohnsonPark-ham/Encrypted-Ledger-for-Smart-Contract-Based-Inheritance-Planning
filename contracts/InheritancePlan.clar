(impl-trait .inheritance-plan-trait.inheritance-plan-trait)

(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-INVALID-PLAN (err u101))
(define-constant ERR-INVALID-ALLOCATION (err u104))
(define-constant ERR-INVALID-CONDITION (err u105))
(define-constant ERR-INVALID-VAULT-ID (err u109))
(define-constant ERR-ENCRYPTION-FAILED (err u111))
(define-constant ERR-MAX-BENEFICIARIES-EXCEEDED (err u115))

(define-data-var plan-counter uint u0)
(define-data-var max-plans uint u500)
(define-data-var execution-fee uint u500)
(define-data-var oracle-contract (optional principal) none)

(define-map plans
  { plan-id: uint }
  {
    creator: principal,
    beneficiaries: (list 20 { beneficiary: principal, share: uint }),
    encrypted-allocations: (buff 2048),
    conditions: (list 10 { event-type: (string-ascii 32), threshold: uint, proof-required: bool }),
    status: (string-ascii 20),
    created-at: uint,
    updated-at: uint,
    vault-id: uint,
    version: uint
  }
)

(define-map plan-executions
  { plan-id: uint }
  {
    executed-at: uint,
    oracle-proof: (buff 512),
    verified: bool,
    executor: principal
  }
)

(define-map beneficiary-claims
  { plan-id: uint, beneficiary: principal }
  {
    claimed: bool,
    claimed-at: uint,
    share-received: uint
  }
)

(define-trait user-registry-trait
  (
    (is-registered (principal) (response bool uint))
  )
)

(define-trait encryption-manager-trait
  (
    (encrypt-data ((buff 2048) (list 20 principal)) (response (buff 2048) uint))
    (verify-decryption (principal (buff 2048)) (response bool uint))
  )
)

(define-trait asset-vault-trait
  (
    (lock-assets (uint principal uint) (response bool uint))
    (release-to-beneficiary (uint principal uint) (response bool uint))
  )
)

(define-trait oracle-verifier-trait
  (
    (verify-condition ((list 10 { event-type: (string-ascii 32), threshold: uint, proof-required: bool }) (buff 512)) (response bool uint))
    (is-verified-oracle () (response principal uint))
  )
)

(define-trait claim-dispatcher-trait
  (
    (initiate-claims (uint (list 20 { beneficiary: principal, share: uint })) (response bool uint))
  )
)

(define-read-only (get-plan (plan-id uint))
  (map-get? plans { plan-id: plan-id })
)

(define-read-only (get-plan-execution (plan-id uint))
  (map-get? plan-executions { plan-id: plan-id })
)

(define-read-only (get-beneficiary-claim (plan-id uint) (beneficiary principal))
  (map-get? beneficiary-claims { plan-id: plan-id, beneficiary: beneficiary })
)

(define-read-only (get-plan-count)
  (var-get plan-counter)
)

(define-private (validate-beneficiaries (beneficiaries (list 20 { beneficiary: principal, share: uint })))
  (let (
        (total-shares (fold + (map get-share beneficiaries) u0))
        (num-beneficiaries (len beneficiaries))
      )
    (and
      (<= num-beneficiaries u20)
      (is-eq total-shares u10000)
      (> num-beneficiaries u0)
    )
  )
)

(define-private (get-share (item { beneficiary: principal, share: uint }))
  (get share item)
)

(define-private (validate-conditions (conditions (list 10 { event-type: (string-ascii 32), threshold: uint, proof-required: bool })))
  (and
    (<= (len conditions) u10)
    (> (len conditions) u0)
    (fold validate-condition conditions true)
  )
)

(define-private (validate-condition (cond { event-type: (string-ascii 32), threshold: uint, proof-required: bool }) (acc bool))
  (and
    acc
    (> (len (get event-type cond)) u0)
    (<= (len (get event-type cond)) u32)
    (>= (get threshold cond) u1)
  )
)

(define-private (validate-encrypted-allocations (alloc (buff 2048)))
  (and (> (len alloc) u0) (<= (len alloc) u2048))
)

(define-private (validate-status (status (string-ascii 20)))
  (or (is-eq status "active") (is-eq status "executed") (is-eq status "disputed"))
)

(define-private (validate-vault-id (vault-id uint))
  (> vault-id u0)
)

(define-public (set-oracle-contract (oracle-principal principal))
  (begin
    (asserts! (is-none (var-get oracle-contract)) ERR-UNAUTHORIZED)
    (var-set oracle-contract (some oracle-principal))
    (ok true)
  )
)

(define-public (set-execution-fee (new-fee uint))
  (begin
    (asserts! (is-some (var-get oracle-contract)) ERR-UNAUTHORIZED)
    (var-set execution-fee new-fee)
    (ok true)
  )
)

(define-public (create-plan
  (beneficiaries (list 20 { beneficiary: principal, share: uint }))
  (conditions (list 10 { event-type: (string-ascii 32), threshold: uint, proof-required: bool }))
  (vault-id uint)
)
  (let (
        (plan-id (var-get plan-counter))
        (caller tx-sender)
        (encrypted-allocations (try! (contract-call? .encryption-manager-trait encrypt-data (buff 0) (map get-beneficiary beneficiaries))))
      )
    (asserts! (< plan-id (var-get max-plans)) ERR-INVALID-PLAN)
    (asserts! (try! (contract-call? .user-registry-trait is-registered caller)) ERR-UNAUTHORIZED)
    (asserts! (validate-beneficiaries beneficiaries) ERR-INVALID-ALLOCATION)
    (asserts! (validate-conditions conditions) ERR-INVALID-CONDITION)
    (asserts! (validate-vault-id vault-id) ERR-INVALID-VAULT-ID)
    (asserts! (validate-encrypted-allocations encrypted-allocations) ERR-ENCRYPTION-FAILED)
    (map-insert plans
      { plan-id: plan-id }
      {
        creator: caller,
        beneficiaries: beneficiaries,
        encrypted-allocations: encrypted-allocations,
        conditions: conditions,
        status: "active",
        created-at: block-height,
        updated-at: block-height,
        vault-id: vault-id,
        version: u1
      }
    )
    (try! (contract-call? .asset-vault-trait lock-assets vault-id caller plan-id))
    (var-set plan-counter (+ plan-id u1))
    (print { event: "plan-created", id: plan-id })
    (ok plan-id)
  )
)

(define-private (get-beneficiary (item { beneficiary: principal, share: uint }))
  (get beneficiary item)
)

(define-public (update-plan
  (plan-id uint)
  (new-beneficiaries (list 20 { beneficiary: principal, share: uint }))
  (new-conditions (list 10 { event-type: (string-ascii 32), threshold: uint, proof-required: bool }))
)
  (let (
        (plan (unwrap! (map-get? plans { plan-id: plan-id }) ERR-INVALID-PLAN))
        (caller tx-sender)
        (current-status (get status plan))
        (current-version (get version plan))
        (encrypted-update (try! (contract-call? .encryption-manager-trait encrypt-data (buff 0) (map get-beneficiary new-beneficiaries))))
      )
    (asserts! (is-eq caller (get creator plan)) ERR-UNAUTHORIZED)
    (asserts! (is-eq current-status "active") ERR-INVALID-PLAN)
    (asserts! (validate-beneficiaries new-beneficiaries) ERR-INVALID-ALLOCATION)
    (asserts! (validate-conditions new-conditions) ERR-INVALID-CONDITION)
    (asserts! (validate-encrypted-allocations encrypted-update) ERR-ENCRYPTION-FAILED)
    (map-set plans
      { plan-id: plan-id }
      (merge plan {
        beneficiaries: new-beneficiaries,
        conditions: new-conditions,
        encrypted-allocations: encrypted-update,
        updated-at: block-height,
        version: (+ current-version u1)
      })
    )
    (print { event: "plan-updated", id: plan-id, version: (+ current-version u1) })
    (ok true)
  )
)

(define-public (execute-plan (plan-id uint) (oracle-proof (buff 512)))
  (let (
        (plan (unwrap! (map-get? plans { plan-id: plan-id }) ERR-INVALID-PLAN))
        (caller tx-sender)
        (oracle (unwrap! (contract-call? .oracle-verifier-trait is-verified-oracle) ERR-UNAUTHORIZED))
      )
    (asserts! (is-eq caller oracle) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status plan) "active") ERR-INVALID-PLAN)
    (asserts! (try! (contract-call? .oracle-verifier-trait verify-condition (get conditions plan) oracle-proof)) ERR-INVALID-PLAN)
    (map-set plans { plan-id: plan-id } (merge plan { status: "executed" }))
    (map-insert plan-executions
      { plan-id: plan-id }
      {
        executed-at: block-height,
        oracle-proof: oracle-proof,
        verified: true,
        executor: caller
      }
    )
    (try! (contract-call? .claim-dispatcher-trait initiate-claims plan-id (get beneficiaries plan)))
    (print { event: "plan-executed", id: plan-id })
    (ok true)
  )
)

(define-public (claim-share (plan-id uint))
  (let (
        (plan (unwrap! (map-get? plans { plan-id: plan-id }) ERR-INVALID-PLAN))
        (caller tx-sender)
        (execution (unwrap! (map-get? plan-executions { plan-id: plan-id }) ERR-INVALID-PLAN))
        (claim-entry (default-to { claimed: false, claimed-at: u0, share-received: u0 } (map-get? beneficiary-claims { plan-id: plan-id, beneficiary: caller })))
        (ben-index (index-of? (map get-beneficiary (get beneficiaries plan)) caller))
      )
    (asserts! (is-eq (get status plan) "executed") ERR-INVALID-PLAN)
    (asserts! (not (get claimed claim-entry)) ERR-INVALID-PLAN)
    (asserts! (is-some ben-index) ERR-INVALID-PLAN)
    (asserts! (try! (contract-call? .encryption-manager-trait verify-decryption caller (get encrypted-allocations plan))) ERR-INVALID-PLAN)
    (let (
          (share (get share (unwrap! (element-at? (get beneficiaries plan) (unwrap! ben-index ERR-INVALID-PLAN)) ERR-INVALID-PLAN)))
        )
      (try! (contract-call? .asset-vault-trait release-to-beneficiary (get vault-id plan) caller share))
      (map-set beneficiary-claims
        { plan-id: plan-id, beneficiary: caller }
        {
          claimed: true,
          claimed-at: block-height,
          share-received: share
        }
      )
      (print { event: "share-claimed", id: plan-id, beneficiary: caller, share: share })
      (ok share)
    )
  )
)