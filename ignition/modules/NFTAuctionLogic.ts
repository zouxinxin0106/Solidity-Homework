import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NFTAuctionLogicModule", (m) => {
    const nftAuctionLogic = m.contract("NFTAuctionLogic");
    return { nftAuctionLogic };
})