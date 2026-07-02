import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MyNFTModule", (m) => {
    const myNFT = m.contract("MyNFT");
    return { myNFT };
})