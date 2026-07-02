import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("NFTAuctionProxyModule", (m) => {
    const nftAuctionProxy = m.contract("NFTAuctionProxy");
    return { nftAuctionProxy };
})