import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("BeggingContractModule", (m) => {
    const begging = m.contract("BeggingContract");
    return { begging };
})