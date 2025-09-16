import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, principalCV, trueCV } from "@stacks/transactions";

const ERR_UNAUTHORIZED = 100;
const ERR_INVALID_PLAN = 101;
const ERR_INVALID_ALLOCATION = 104;
const ERR_INVALID_CONDITION = 105;
const ERR_INVALID_VAULT_ID = 109;
const ERR_ENCRYPTION_FAILED = 111;
const ERR_MAX_BENEFICIARIES_EXCEEDED = 115;

interface Beneficiary {
  beneficiary: string;
  share: number;
}

interface Condition {
  eventType: string;
  threshold: number;
  proofRequired: boolean;
}

interface Plan {
  creator: string;
  beneficiaries: Beneficiary[];
  encryptedAllocations: Uint8Array;
  conditions: Condition[];
  status: string;
  createdAt: number;
  updatedAt: number;
  vaultId: number;
  version: number;
}

interface PlanExecution {
  executedAt: number;
  oracleProof: Uint8Array;
  verified: boolean;
  executor: string;
}

interface BeneficiaryClaim {
  claimed: boolean;
  claimedAt: number;
  shareReceived: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class InheritancePlanMock {
  state: {
    planCounter: number;
    maxPlans: number;
    executionFee: number;
    oracleContract: string | null;
    plans: Map<number, Plan>;
    planExecutions: Map<number, PlanExecution>;
    beneficiaryClaims: Map<string, BeneficiaryClaim>;
  } = {
    planCounter: 0,
    maxPlans: 500,
    executionFee: 500,
    oracleContract: null,
    plans: new Map(),
    planExecutions: new Map(),
    beneficiaryClaims: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
  userRegistryResults: Map<string, boolean> = new Map([["ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", true]]);
  encryptionResults: Map<string, Uint8Array> = new Map();
  decryptionResults: Map<string, boolean> = new Map([["ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", true]]);
  oracleResults: { verify: boolean; oracle: string } = { verify: true, oracle: "ST2ORACLE" };
  vaultResults: Map<string, boolean> = new Map();
  dispatcherResults: boolean = true;
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      planCounter: 0,
      maxPlans: 500,
      executionFee: 500,
      oracleContract: null,
      plans: new Map(),
      planExecutions: new Map(),
      beneficiaryClaims: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    this.userRegistryResults = new Map([["ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", true]]);
    this.encryptionResults = new Map();
    this.decryptionResults = new Map([["ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", true]]);
    this.oracleResults = { verify: true, oracle: "ST2ORACLE" };
    this.vaultResults = new Map();
    this.dispatcherResults = true;
    this.stxTransfers = [];
  }

  isRegistered(principal: string): Result<boolean> {
    const registered = this.userRegistryResults.get(principal) || false;
    return { ok: true, value: registered };
  }

  encryptData(data: string, beneficiaries: string[]): Result<Uint8Array> {
    const key = `${data}-${beneficiaries.join(',')}`;
    const result = this.encryptionResults.get(key) || new Uint8Array([1, 2, 3]);
    return { ok: true, value: result };
  }

  verifyDecryption(principal: string, enc: Uint8Array): Result<boolean> {
    const key = `${principal}-${Array.from(enc).join(',')}`;
    const result = this.decryptionResults.get(key) || false;
    return { ok: true, value: result };
  }

  verifyCondition(conditions: Condition[], proof: Uint8Array): Result<boolean> {
    return { ok: true, value: this.oracleResults.verify };
  }

  isVerifiedOracle(): Result<string> {
    return { ok: true, value: this.oracleResults.oracle };
  }

  lockAssets(vaultId: number, creator: string, planId: number): Result<boolean> {
    const key = `${vaultId}-${creator}-${planId}`;
    const result = this.vaultResults.get(key) || true;
    if (result) {
      this.stxTransfers.push({ amount: 0, from: creator, to: null });
    }
    return { ok: true, value: result };
  }

  releaseToBeneficiary(vaultId: number, beneficiary: string, share: number): Result<boolean> {
    const key = `${vaultId}-${beneficiary}-${share}`;
    const result = this.vaultResults.get(key) || true;
    if (result) {
      this.stxTransfers.push({ amount: share, from: "vault", to: beneficiary });
    }
    return { ok: true, value: result };
  }

  initiateClaims(planId: number, beneficiaries: Beneficiary[]): Result<boolean> {
    return { ok: true, value: this.dispatcherResults };
  }

  setOracleContract(oracle: string): Result<boolean> {
    if (this.state.oracleContract) return { ok: false, value: false };
    this.state.oracleContract = oracle;
    return { ok: true, value: true };
  }

  setExecutionFee(fee: number): Result<boolean> {
    if (!this.state.oracleContract) return { ok: false, value: false };
    this.state.executionFee = fee;
    return { ok: true, value: true };
  }

  createPlan(
    beneficiaries: Beneficiary[],
    conditions: Condition[],
    vaultId: number
  ): Result<number> {
    if (!this.state.oracleContract) return { ok: false, value: ERR_UNAUTHORIZED };
    if (this.state.planCounter >= this.state.maxPlans) return { ok: false, value: ERR_INVALID_PLAN };
    if (!this.isRegistered(this.caller).value) return { ok: false, value: ERR_UNAUTHORIZED };
    let totalShares = 0;
    if (beneficiaries.length > 20 || beneficiaries.length === 0) return { ok: false, value: ERR_MAX_BENEFICIARIES_EXCEEDED };
    for (const b of beneficiaries) {
      if (b.share <= 0) return { ok: false, value: ERR_INVALID_ALLOCATION };
      totalShares += b.share;
    }
    if (totalShares !== 10000) return { ok: false, value: ERR_INVALID_ALLOCATION };
    if (conditions.length > 10 || conditions.length === 0) return { ok: false, value: ERR_INVALID_CONDITION };
    for (const c of conditions) {
      if (c.threshold < 1 || c.eventType.length === 0 || c.eventType.length > 32) {
        return { ok: false, value: ERR_INVALID_CONDITION };
      }
    }
    if (vaultId <= 0) return { ok: false, value: ERR_INVALID_VAULT_ID };
    const encResult = this.encryptData("", beneficiaries.map(b => b.beneficiary));
    if (!encResult.ok) return { ok: false, value: ERR_ENCRYPTION_FAILED };
    if (encResult.value.length === 0 || encResult.value.length > 2048) return { ok: false, value: ERR_ENCRYPTION_FAILED };
    const planId = this.state.planCounter;
    const plan: Plan = {
      creator: this.caller,
      beneficiaries,
      encryptedAllocations: encResult.value,
      conditions,
      status: "active",
      createdAt: this.blockHeight,
      updatedAt: this.blockHeight,
      vaultId,
      version: 1,
    };
    this.state.plans.set(planId, plan);
    const lockResult = this.lockAssets(vaultId, this.caller, planId);
    if (!lockResult.ok) return { ok: false, value: ERR_INVALID_VAULT_ID };
    this.state.planCounter++;
    return { ok: true, value: planId };
  }

  getPlan(planId: number): Plan | null {
    return this.state.plans.get(planId) || null;
  }

  updatePlan(planId: number, newBeneficiaries: Beneficiary[], newConditions: Condition[]): Result<boolean> {
    const plan = this.state.plans.get(planId);
    if (!plan) return { ok: false, value: false };
    if (plan.creator !== this.caller) return { ok: false, value: false };
    if (plan.status !== "active") return { ok: false, value: false };
    let totalShares = 0;
    if (newBeneficiaries.length > 20 || newBeneficiaries.length === 0) return { ok: false, value: ERR_MAX_BENEFICIARIES_EXCEEDED };
    for (const b of newBeneficiaries) {
      if (b.share <= 0) return { ok: false, value: ERR_INVALID_ALLOCATION };
      totalShares += b.share;
    }
    if (totalShares !== 10000) return { ok: false, value: ERR_INVALID_ALLOCATION };
    if (newConditions.length > 10 || newConditions.length === 0) return { ok: false, value: ERR_INVALID_CONDITION };
    for (const c of newConditions) {
      if (c.threshold < 1 || c.eventType.length === 0 || c.eventType.length > 32) {
        return { ok: false, value: ERR_INVALID_CONDITION };
      }
    }
    const encResult = this.encryptData("", newBeneficiaries.map(b => b.beneficiary));
    if (!encResult.ok) return { ok: false, value: false };
    if (encResult.value.length === 0 || encResult.value.length > 2048) return { ok: false, value: ERR_ENCRYPTION_FAILED };
    const updatedPlan: Plan = {
      ...plan,
      beneficiaries: newBeneficiaries,
      conditions: newConditions,
      encryptedAllocations: encResult.value,
      updatedAt: this.blockHeight,
      version: plan.version + 1,
    };
    this.state.plans.set(planId, updatedPlan);
    return { ok: true, value: true };
  }

  executePlan(planId: number, oracleProof: Uint8Array): Result<boolean> {
    const plan = this.state.plans.get(planId);
    if (!plan) return { ok: false, value: false };
    if (this.caller !== this.oracleResults.oracle) return { ok: false, value: false };
    if (plan.status !== "active") return { ok: false, value: false };
    const verifyResult = this.verifyCondition(plan.conditions, oracleProof);
    if (!verifyResult.ok || !verifyResult.value) return { ok: false, value: false };
    plan.status = "executed";
    this.state.plans.set(planId, plan);
    this.state.planExecutions.set(planId, {
      executedAt: this.blockHeight,
      oracleProof,
      verified: true,
      executor: this.caller,
    });
    const initResult = this.initiateClaims(planId, plan.beneficiaries);
    if (!initResult.ok) return { ok: false, value: false };
    return { ok: true, value: true };
  }

  claimShare(planId: number): Result<number> {
    const plan = this.state.plans.get(planId);
    if (!plan) return { ok: false, value: 0 };
    if (plan.status !== "executed") return { ok: false, value: 0 };
    const execution = this.state.planExecutions.get(planId);
    if (!execution) return { ok: false, value: 0 };
    const claimKey = `${planId}-${this.caller}`;
    const claim = this.state.beneficiaryClaims.get(claimKey);
    if (claim && claim.claimed) return { ok: false, value: 0 };
    const benIndex = plan.beneficiaries.findIndex(b => b.beneficiary === this.caller);
    if (benIndex === -1) return { ok: false, value: 0 };
    const share = plan.beneficiaries[benIndex].share;
    const decKey = `${this.caller}-${Array.from(plan.encryptedAllocations).join(',')}`;
    const decResult = this.decryptionResults.get(decKey) || false;
    if (!decResult) return { ok: false, value: 0 };
    const releaseResult = this.releaseToBeneficiary(plan.vaultId, this.caller, share);
    if (!releaseResult.ok || !releaseResult.value) return { ok: false, value: 0 };
    this.state.beneficiaryClaims.set(claimKey, {
      claimed: true,
      claimedAt: this.blockHeight,
      shareReceived: share,
    });
    return { ok: true, value: share };
  }

  getPlanCount(): Result<number> {
    return { ok: true, value: this.state.planCounter };
  }
}

describe("InheritancePlan", () => {
  let contract: InheritancePlanMock;

  beforeEach(() => {
    contract = new InheritancePlanMock();
    contract.reset();
  });

  it("creates a plan successfully", () => {
    contract.setOracleContract("ST2ORACLE");
    const beneficiaries: Beneficiary[] = [
      { beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 5000 },
      { beneficiary: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5", share: 5000 }
    ];
    const conditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.createPlan(beneficiaries, conditions, 1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const plan = contract.getPlan(0);
    expect(plan?.creator).toBe("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM");
    expect(plan?.beneficiaries).toEqual(beneficiaries);
    expect(plan?.conditions).toEqual(conditions);
    expect(plan?.status).toBe("active");
    expect(plan?.vaultId).toBe(1);
    expect(contract.stxTransfers.length).toBe(1);
  });

  it("rejects plan creation with invalid total shares", () => {
    contract.setOracleContract("ST2ORACLE");
    const beneficiaries: Beneficiary[] = [
      { beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 6000 },
      { beneficiary: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5", share: 5000 }
    ];
    const conditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.createPlan(beneficiaries, conditions, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ALLOCATION);
  });

  it("rejects plan creation without user registration", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.userRegistryResults.set("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", false);
    const beneficiaries: Beneficiary[] = [
      { beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 5000 },
      { beneficiary: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5", share: 5000 }
    ];
    const conditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.createPlan(beneficiaries, conditions, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });

  it("rejects plan creation with too many beneficiaries", () => {
    contract.setOracleContract("ST2ORACLE");
    const beneficiaries: Beneficiary[] = Array(21).fill(0).map((_, i) => ({
      beneficiary: `ST${i}PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM`,
      share: Math.floor(10000 / 21)
    }));
    const conditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.createPlan(beneficiaries, conditions, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_BENEFICIARIES_EXCEEDED);
  });

  it("rejects plan creation without oracle contract", () => {
    const beneficiaries: Beneficiary[] = [
      { beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 5000 },
      { beneficiary: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5", share: 5000 }
    ];
    const conditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.createPlan(beneficiaries, conditions, 1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_UNAUTHORIZED);
  });

  it("updates a plan successfully", () => {
    contract.setOracleContract("ST2ORACLE");
    const initialBeneficiaries: Beneficiary[] = [
      { beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 5000 },
      { beneficiary: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5", share: 5000 }
    ];
    const initialConditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    contract.createPlan(initialBeneficiaries, initialConditions, 1);
    const newBeneficiaries: Beneficiary[] = [
      { beneficiary: "ST2CY5V39QN1Z6FGA3W2J159J4J2T4K5J9M8N9K4", share: 3000 },
      { beneficiary: "ST3J5K7Z2Q8N1Z9M8N7K6J4H3G2F1E0D9C8B7A6", share: 7000 }
    ];
    const newConditions: Condition[] = [
      { eventType: "death", threshold: 2, proofRequired: false }
    ];
    const result = contract.updatePlan(0, newBeneficiaries, newConditions);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const plan = contract.getPlan(0);
    expect(plan?.beneficiaries).toEqual(newBeneficiaries);
    expect(plan?.conditions).toEqual(newConditions);
    expect(plan?.version).toBe(2);
  });

  it("rejects update for non-existent plan", () => {
    contract.setOracleContract("ST2ORACLE");
    const newBeneficiaries: Beneficiary[] = [
      { beneficiary: "ST2CY5V39QN1Z6FGA3W2J159J4J2T4K5J9M8N9K4", share: 5000 },
      { beneficiary: "ST3J5K7Z2Q8N1Z9M8N7K6J4H3G2F1E0D9C8B7A6", share: 5000 }
    ];
    const newConditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.updatePlan(999, newBeneficiaries, newConditions);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-creator", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST3FAKE";
    const newBeneficiaries: Beneficiary[] = [
      { beneficiary: "ST2CY5V39QN1Z6FGA3W2J159J4J2T4K5J9M8N9K4", share: 5000 },
      { beneficiary: "ST3J5K7Z2Q8N1Z9M8N7K6J4H3G2F1E0D9C8B7A6", share: 5000 }
    ];
    const newConditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.updatePlan(0, newBeneficiaries, newConditions);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update for executed plan", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    const plan = contract.getPlan(0);
    if (plan) plan.status = "executed";
    contract.state.plans.set(0, plan!);
    const newBeneficiaries: Beneficiary[] = [
      { beneficiary: "ST2CY5V39QN1Z6FGA3W2J159J4J2T4K5J9M8N9K4", share: 5000 },
      { beneficiary: "ST3J5K7Z2Q8N1Z9M8N7K6J4H3G2F1E0D9C8B7A6", share: 5000 }
    ];
    const newConditions: Condition[] = [
      { eventType: "death", threshold: 1, proofRequired: true }
    ];
    const result = contract.updatePlan(0, newBeneficiaries, newConditions);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("executes a plan successfully", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.oracleResults.oracle = "ST2ORACLE";
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST2ORACLE";
    const proof = new Uint8Array([4, 5, 6]);
    const result = contract.executePlan(0, proof);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const plan = contract.getPlan(0);
    expect(plan?.status).toBe("executed");
    const execution = contract.state.planExecutions.get(0);
    expect(execution?.verified).toBe(true);
    expect(execution?.executor).toBe("ST2ORACLE");
  });

  it("rejects execution by unauthorized caller", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST3FAKE";
    const proof = new Uint8Array([4, 5, 6]);
    const result = contract.executePlan(0, proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects execution for already executed plan", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.oracleResults.oracle = "ST2ORACLE";
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    const plan = contract.getPlan(0);
    if (plan) plan.status = "executed";
    contract.state.plans.set(0, plan!);
    contract.caller = "ST2ORACLE";
    const proof = new Uint8Array([4, 5, 6]);
    const result = contract.executePlan(0, proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects execution with invalid oracle proof", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.oracleResults.oracle = "ST2ORACLE";
    contract.oracleResults.verify = false;
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST2ORACLE";
    const proof = new Uint8Array([4, 5, 6]);
    const result = contract.executePlan(0, proof);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("claims share successfully", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.oracleResults.oracle = "ST2ORACLE";
    const beneficiaries: Beneficiary[] = [
      { beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 5000 },
      { beneficiary: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5", share: 5000 }
    ];
    contract.createPlan(beneficiaries, [{ eventType: "death", threshold: 1, proofRequired: true }], 1);
    contract.caller = "ST2ORACLE";
    const proof = new Uint8Array([4, 5, 6]);
    contract.executePlan(0, proof);
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    contract.decryptionResults.set("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM-1,2,3", true);
    const result = contract.claimShare(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(5000);
    const claimKey = "0-ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const claim = contract.state.beneficiaryClaims.get(claimKey);
    expect(claim?.claimed).toBe(true);
    expect(claim?.shareReceived).toBe(5000);
    expect(contract.stxTransfers.length).toBe(2);
  });

  it("rejects claim for non-beneficiary", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.oracleResults.oracle = "ST2ORACLE";
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST2ORACLE";
    const proof = new Uint8Array([4, 5, 6]);
    contract.executePlan(0, proof);
    contract.caller = "ST3FAKE";
    const result = contract.claimShare(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(0);
  });

  it("rejects claim without decryption", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.oracleResults.oracle = "ST2ORACLE";
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST2ORACLE";
    const proof = new Uint8Array([4, 5, 6]);
    contract.executePlan(0, proof);
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    contract.decryptionResults.set("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM-1,2,3", false);
    const result = contract.claimShare(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(0);
  });

  it("rejects claim for already claimed share", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.oracleResults.oracle = "ST2ORACLE";
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST2ORACLE";
    const proof = new Uint8Array([4, 5, 6]);
    contract.executePlan(0, proof);
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    contract.decryptionResults.set("ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM-1,2,3", true);
    contract.claimShare(0);
    const result = contract.claimShare(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(0);
  });

  it("rejects claim before execution", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.caller = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    const result = contract.claimShare(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(0);
  });

  it("returns correct plan count", () => {
    contract.setOracleContract("ST2ORACLE");
    contract.createPlan(
      [{ beneficiary: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      1
    );
    contract.createPlan(
      [{ beneficiary: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5", share: 10000 }],
      [{ eventType: "death", threshold: 1, proofRequired: true }],
      2
    );
    const result = contract.getPlanCount();
    expect(result).toEqual({ ok: true, value: 2 });
  });

  it("sets oracle contract successfully", () => {
    const result = contract.setOracleContract("ST2ORACLE");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.oracleContract).toBe("ST2ORACLE");
  });

  it("rejects setting oracle contract twice", () => {
    contract.setOracleContract("ST2ORACLE");
    const result = contract.setOracleContract("ST3ORACLE");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets execution fee successfully", () => {
    contract.setOracleContract("ST2ORACLE");
    const result = contract.setExecutionFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.executionFee).toBe(1000);
  });

  it("rejects setting execution fee without oracle", () => {
    const result = contract.setExecutionFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});