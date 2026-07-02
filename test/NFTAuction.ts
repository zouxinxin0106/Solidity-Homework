// ============================== 导入依赖 ==============================
// chai 用来判断"结果对不对"
import { expect } from "chai";
// hardhat 用来连接测试链
import { network } from "hardhat";
// ethers 部署合约、发交易；networkHelpers 操纵时间
const { ethers, networkHelpers } = await network.create();

// ============================== 常用数值常量 ==============================
const AUCTION_DURATION = 86400n;                           // 1 天（秒）
const STARTING_PRICE = ethers.parseEther("0.1");  
// 把人类看的 ETH 单位转换成链上最小单位 Wei         // 起拍价 0.1 ETH
const BID_1 = ethers.parseEther("1");                      // 出价 1 ETH
const BID_2 = ethers.parseEther("2");                      // 出价 2 ETH

// ============================== 测试准备函数（Fixtrue） ==============================
// loadFixture 会记住第一次部署结果，后续测试直接"读档"回来，省时间
async function deployFixture() {
  const [owner, seller, bidder1, bidder2] = await ethers.getSigners();

  // ---- 1. 部署 MyNFT ----
  const MyNFT = await ethers.getContractFactory("MyNFT");
  const nft = await MyNFT.deploy();
  // owner 铸造 NFT 送给 seller，seller 才能拿去拍卖
  await nft.safeMint(seller.address, "ipfs://nft-uri");

  // ---- 2. 部署拍卖合约（UUPS 代理模式）----
  // 先部署"逻辑合约"（实现合约）
  const NFTAuctionLogic = await ethers.getContractFactory("NFTAuctionLogic");
  const logicImpl = await NFTAuctionLogic.deploy();

  // 再部署"代理合约"，把逻辑合约地址和初始化参数传进去
  const initData = NFTAuctionLogic.interface.encodeFunctionData("initialize", [
    owner.address,
    ethers.ZeroAddress, // 价格预言机传 0，测试不依赖它
  ]);
  const NFTAuctionProxy = await ethers.getContractFactory("NFTAuctionProxy");
  const proxy = await NFTAuctionProxy.deploy(await logicImpl.getAddress(), initData);

  // attach：用 NFTAuctionLogic 的 ABI 绑定代理地址，通过代理调合约
  const auction = NFTAuctionLogic.attach(await proxy.getAddress());

  return { auction, nft, owner, seller, bidder1, bidder2 };
}

// ============================== 测试用例 ==============================

describe("NFTAuction 拍卖合约测试", function () {

  /* ============ 1. 部署 ============ */
  describe("部署", function () {
    it("owner 应该等于部署者", async function () {
      const { auction, owner } = await networkHelpers.loadFixture(deployFixture);
      expect(await auction.owner()).to.equal(owner.address);
    });

    it("通过代理调用合约应该正常", async function () {
      const { auction } = await networkHelpers.loadFixture(deployFixture);
      expect(await auction.auctionCount()).to.equal(0n);
    });
  });

  /* ============ 2. 创建拍卖 ============ */
  describe("创建拍卖", function () {
    it("seller 创建 ETH 拍卖，NFT 自动转入合约", async function () {
      const { auction, nft, seller } = await networkHelpers.loadFixture(deployFixture);

      // 授权拍卖合约操作 seller 的 NFT
      await nft.connect(seller).approve(await auction.getAddress(), 1);
      // 创建拍卖
      const tx = await auction.connect(seller).createAuction(
        await nft.getAddress(), 1, STARTING_PRICE,
        ethers.ZeroAddress, // 0 地址 = 用 ETH 出价
        AUCTION_DURATION
      );
      await tx.wait();

      // 验证拍卖信息
      const info = await auction.getAuction(1);
      expect(info.seller).to.equal(seller.address);
      expect(info.startingPrice).to.equal(STARTING_PRICE);
      expect(info.bidToken).to.equal(ethers.ZeroAddress);
      expect(info.active).to.be.true;
      // NFT 已转入合约
      expect(await nft.ownerOf(1)).to.equal(await auction.getAddress());
    });
  });

  /* ============ 3. 出价 ============ */
  describe("ETH 出价", function () {
    it("bidder1 出价 1 ETH 成功", async function () {
      const { auction, nft, seller, bidder1 } = await networkHelpers.loadFixture(deployFixture);

      await nft.connect(seller).approve(await auction.getAddress(), 1);
      await auction.connect(seller).createAuction(
        await nft.getAddress(), 1, STARTING_PRICE, ethers.ZeroAddress, AUCTION_DURATION
      );

      await auction.connect(bidder1).placeBid(1, ethers.ZeroAddress, 0, { value: BID_1 });

      const info = await auction.getAuction(1);
      expect(info.highestBid).to.equal(BID_1);
      expect(info.highestBidder).to.equal(bidder1.address);
    });

    it("被超车时自动退款给上一个出价者", async function () {
      const { auction, nft, seller, bidder1, bidder2 } = await networkHelpers.loadFixture(deployFixture);

      await nft.connect(seller).approve(await auction.getAddress(), 1);
      await auction.connect(seller).createAuction(
        await nft.getAddress(), 1, STARTING_PRICE, ethers.ZeroAddress, AUCTION_DURATION
      );

      // bidder1 先出价 1 ETH
      await auction.connect(bidder1).placeBid(1, ethers.ZeroAddress, 0, { value: BID_1 });
      const balanceBefore = await ethers.provider.getBalance(bidder1.address);

      // bidder2 出价 2 ETH 超过 bidder1
      await auction.connect(bidder2).placeBid(1, ethers.ZeroAddress, 0, { value: BID_2 });

      // bidder1 的 1 ETH 应该已被退回（余额 >= 出价前）
      expect(await ethers.provider.getBalance(bidder1.address)).to.be.gte(balanceBefore);
    });
  });

  /* ============ 4. 结束拍卖 ============ */
  describe("结束拍卖", function () {
    it("拍卖结束后 NFT 归出价者，钱归卖家", async function () {
      const { auction, nft, seller, bidder1 } = await networkHelpers.loadFixture(deployFixture);

      await nft.connect(seller).approve(await auction.getAddress(), 1);
      await auction.connect(seller).createAuction(
        await nft.getAddress(), 1, STARTING_PRICE, ethers.ZeroAddress, AUCTION_DURATION
      );
      await auction.connect(bidder1).placeBid(1, ethers.ZeroAddress, 0, { value: BID_1 });

      // ⏰ 快进到拍卖结束后
      await networkHelpers.time.increase(AUCTION_DURATION + 1n);
      await networkHelpers.mine();

      const sellerBalBefore = await ethers.provider.getBalance(seller.address);

      // 结束拍卖
      await auction.connect(bidder1).endAuction(1);

      // NFT 归出价者
      expect(await nft.ownerOf(1)).to.equal(bidder1.address);
      // 卖家收到钱
      expect(await ethers.provider.getBalance(seller.address)).to.be.gt(sellerBalBefore);
    });
  });

  /* ============ 5. 合约升级 ============ */
  describe("合约升级（UUPS 模式）", function () {
    it("owner 可以升级合约", async function () {
      const { auction, owner } = await networkHelpers.loadFixture(deployFixture);

      const NFTAuctionLogic = await ethers.getContractFactory("NFTAuctionLogic");
      const newImpl = await NFTAuctionLogic.deploy();

      await auction.connect(owner).upgradeToAndCall(await newImpl.getAddress(), "0x");

      // 升级后仍正常
      expect(await auction.auctionCount()).to.equal(0n);
    });

    it("非 owner 不能升级", async function () {
      const { auction, bidder1 } = await networkHelpers.loadFixture(deployFixture);

      const NFTAuctionLogic = await ethers.getContractFactory("NFTAuctionLogic");
      const newImpl = await NFTAuctionLogic.deploy();

      try {
        await auction.connect(bidder1).upgradeToAndCall(await newImpl.getAddress(), "0x");
        expect.fail("应该报错但没有");
      } catch (err: unknown) {
        expect((err as Error).message).to.include("OwnableUnauthorizedAccount");
      }
    });
  });
});
