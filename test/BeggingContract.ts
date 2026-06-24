// ============================== 导入依赖 ==============================

// chai 是一个断言库，提供了 expect 语法来验证测试结果
import { expect } from "chai";
// hardhat 是开发框架，network 对象用于创建测试网络的连接
import { network } from "hardhat";

// ============================== 初始化测试网络连接 ==============================

// network.create() 会启动一个临时的本地模拟区块链（EDR 网络）
// ethers —— 用来部署合约、发送交易、查询链上数据
// networkHelpers —— 提供 EVM 状态操纵工具（时间跳跃、快照、挖矿等）
// 注意：这里是顶层的 await，因为 Hardhat 3 支持 ESM 顶级 await
const { ethers, networkHelpers } = await network.create();

// ============================== 测试夹具（Fixture） ==============================

/**
 * deployBeggingFixture
 * 在每个测试用例之前部署一个新的 BeggingContract 实例。
 * loadFixture 会缓存部署结果，从第二次调用开始直接恢复快照而不是重新部署，
 * 大幅加快测试速度。
 *
 * @returns { contract, owner, donor1, donor2, donor3 }
 *   - contract: 新部署的 BeggingContract 实例
 *   - owner:    默认第一个签名者（也是合约的部署者/所有者）
 *   - donor1~3: 其他签名者，用来模拟不同的捐赠者
 */
async function deployBeggingFixture() {
  // getSigners() 返回 Hardhat 内置的测试账户列表，每个账户预分配了大量测试 ETH
  const [owner, donor1, donor2, donor3] = await ethers.getSigners();
  // deployContract 编译并部署 BeggingContract，返回类型安全的合约实例
  const contract = await ethers.deployContract("BeggingContract");
  // 返回所有对象，供测试用例使用
  return { contract, owner, donor1, donor2, donor3 };
}

// ============================== 测试套件 ==============================

// describe 是 Mocha 的测试分组函数，将相关的测试用例组织在一起
describe("BeggingContract", function () {

  // ======================== donate() 函数的测试 ========================

  describe("donate()", function () {

    // 测试 1：捐赠后，合约正确记录该地址的捐赠金额
    it("应该能接受捐赠并更新捐赠者的余额", async function () {
      // loadFixture：要么部署新合约，要么恢复之前部署的快照
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      // parseEther("1.0") 将 1 ETH 转换为 wei 单位（1 ETH = 10^18 wei）
      const amount = ethers.parseEther("1.0");
      // connect(donor1) 以 donor1 的身份调用合约；{ value: amount } 表示附带 1 ETH
      await contract.connect(donor1).donate({ value: amount });

      // 断言：getDonation(donor1.address) 应该返回 1 ETH（单位为 wei）
      expect(await contract.getDonation(donor1.address)).to.equal(amount);
    });

    // 测试 2：同一地址多次捐赠，金额累加
    it("应该能累加同一地址的多次捐赠", async function () {
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      // 第一次捐赠 1 ETH
      await contract.connect(donor1).donate({ value: ethers.parseEther("1.0") });
      // 第二次捐赠 0.5 ETH
      await contract.connect(donor1).donate({ value: ethers.parseEther("0.5") });

      // 断言：累计金额应为 1.5 ETH
      expect(await contract.getDonation(donor1.address)).to.equal(ethers.parseEther("1.5"));
    });

    // 测试 3：捐赠 0 ETH 时交易应该被回滚
    it("应该拒绝 0 ETH 的捐赠", async function () {
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      // expect(...).to.be.revertedWith(...) 是 chai 匹配器，断言交易被回滚并包含指定错误信息
      // 0n 表示 BigInt 类型的 0（Solidity 中 uint256 对应 JS 的 bigint）
      await expect(contract.connect(donor1).donate({ value: 0n })).to.be.revertedWith(
        "Donation must be greater than 0."
      );
    });

    // 测试 4：成功捐赠后应该发出 Donate 事件
    it("成功捐赠后应该发出 Donate 事件", async function () {
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      const amount = ethers.parseEther("0.1");
      // 先执行交易，获取交易回执
      const tx = await contract.connect(donor1).donate({ value: amount });
      const receipt = await tx.wait();
      // 根据交易所在区块号获取区块信息，其中的 timestamp 就是事件里的时间戳
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      // 断言交易应该触发 Donate 事件，事件的三个参数分别匹配：
      //   donor1.address（捐赠者地址）、amount（金额）、block.timestamp（区块时间戳）
      await expect(tx).to.emit(contract, "Donate").withArgs(donor1.address, amount, block.timestamp);
    });

    // 测试 5：排行榜应该能正确排列前 3 名捐赠者
    it("应该正确追踪 Top 3 捐赠者排行榜", async function () {
      const { contract, donor1, donor2, donor3 } =
        await networkHelpers.loadFixture(deployBeggingFixture);

      // donor1 捐 1 ETH，donor2 捐 2 ETH，donor3 捐 3 ETH
      await contract.connect(donor1).donate({ value: ethers.parseEther("1.0") });
      await contract.connect(donor2).donate({ value: ethers.parseEther("2.0") });
      await contract.connect(donor3).donate({ value: ethers.parseEther("3.0") });

      // getTop3Donors() 返回 address[]，按金额从高到低排列
      const top3 = await contract.getTop3Donors();
      // 断言：第 1 名是 donor3（3 ETH），第 2 名是 donor2（2 ETH），第 3 名是 donor1（1 ETH）
      expect(top3[0]).to.equal(donor3.address);
      expect(top3[1]).to.equal(donor2.address);
      expect(top3[2]).to.equal(donor1.address);
    });

    // 测试 6：超过捐赠截止日期后不能再捐赠
    it("超过截止日期后应该拒绝捐赠", async function () {
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      // networkHelpers.time.increase() 将链上时间快速向前推进（单位：秒）
      // 30 * 24 * 60 * 60 + 1 = 30 天 + 1 秒，确保超过 30 天的 deadline
      await networkHelpers.time.increase(30 * 24 * 60 * 60 + 1);

      // 断言：捐赠交易被回滚，错误信息为 "Donation period has ended."
      await expect(
        contract.connect(donor1).donate({ value: ethers.parseEther("0.1") })
      ).to.be.revertedWith("Donation period has ended.");
    });
  });

  // ======================== getDonation() 函数的测试 ========================

  describe("getDonation()", function () {

    // 测试 7：从未捐赠过的地址查询金额应返回 0
    it("从未捐赠过的地址应该返回 0", async function () {
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      // 还没有任何捐赠操作，直接查询
      // 0n 是 BigInt 类型的 0，对应 Solidity 中 uint256 的 0
      expect(await contract.getDonation(donor1.address)).to.equal(0n);
    });

    // 测试 8：捐赠后查询应返回正确的金额
    it("捐赠后应该返回正确的金额", async function () {
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      // donor1 捐赠 2 ETH
      await contract.connect(donor1).donate({ value: ethers.parseEther("2.0") });

      // 断言查询结果等于 2 ETH
      expect(await contract.getDonation(donor1.address)).to.equal(ethers.parseEther("2.0"));
    });
  });

  // ======================== withdraw() 函数的测试 ========================

  describe("withdraw()", function () {

    // 测试 9：合约所有者可以提取全部资金
    it("所有者应该能提取全部资金", async function () {
      const { contract, owner, donor1 } =
        await networkHelpers.loadFixture(deployBeggingFixture);

      const donation = ethers.parseEther("5.0");
      // donor1 先捐赠 5 ETH
      await contract.connect(donor1).donate({ value: donation });

      // 记录提款前 owner 的 ETH 余额
      const ownerBalanceBefore = await ethers.provider.getBalance(owner.address);

      // 发起提款交易，获取回执以计算 Gas 费用
      const tx = await contract.connect(owner).withdraw();
      const receipt = await tx.wait();
      // gasUsed × gasPrice = 实际消耗的 Gas 费用（单位 wei）
      const gasCost = receipt.gasUsed * receipt.gasPrice;

      // 提款后 owner 的 ETH 余额
      const ownerBalanceAfter = await ethers.provider.getBalance(owner.address);
      // 断言：owner 余额增加值（减去 Gas 费后）等于捐赠金额 5 ETH
      // 公式：(提款后余额 - 提款前余额) + Gas费 = 提取金额
      expect(ownerBalanceAfter - ownerBalanceBefore + gasCost).to.equal(donation);
    });

    // 测试 10：非所有者调用 withdraw() 应回滚
    it("非所有者调用提款应该被拒绝", async function () {
      const { contract, donor1 } = await networkHelpers.loadFixture(deployBeggingFixture);

      // donor1 先捐 1 ETH（让合约里有资金）
      await contract.connect(donor1).donate({ value: ethers.parseEther("1.0") });

      // donor1 不是 owner，尝试提款应该被回滚
      await expect(contract.connect(donor1).withdraw()).to.be.revertedWith(
        "Only the owner can call this function."
      );
    });

    // 测试 11：合约余额为 0 时提款应回滚
    it("没有资金时提款应该失败", async function () {
      const { contract, owner } = await networkHelpers.loadFixture(deployBeggingFixture);

      // 没有进行任何捐赠，合约余额为 0
      // owner 尝试提款应该被回滚
      await expect(contract.connect(owner).withdraw()).to.be.revertedWith(
        "No funds to withdraw."
      );
    });

    // 测试 12：提款后捐赠记录仍然保留
    it("提款后捐赠记录不应该丢失", async function () {
      const { contract, owner, donor1 } =
        await networkHelpers.loadFixture(deployBeggingFixture);

      // donor1 捐赠 2 ETH
      await contract.connect(donor1).donate({ value: ethers.parseEther("2.0") });
      // owner 提取所有资金
      await contract.connect(owner).withdraw();

      // 断言：getDonation 仍然返回 2 ETH，说明提款只清空了合约余额
      // 但保留了每个地址的捐赠记录（mapping 数据不变）
      expect(await contract.getDonation(donor1.address)).to.equal(ethers.parseEther("2.0"));
    });
  });

  // ======================== 部署相关测试 ========================

  describe("deployment", function () {

    // 测试 13：部署者应该成为合约的 owner
    it("应该将部署者设为合约所有者", async function () {
      const { contract, owner } = await networkHelpers.loadFixture(deployBeggingFixture);

      // 合约的 owner() 应等于部署时使用的签名者地址
      expect(await contract.owner()).to.equal(owner.address);
    });

    // 测试 14：捐赠截止日期应该设为部署时间的 30 天后
    it("捐赠截止日期应该设为部署时间的 30 天后", async function () {
      const { contract } = await networkHelpers.loadFixture(deployBeggingFixture);

      // time.latest() 返回当前区块的时间戳（单位：秒，number 类型）
      const latestBlockTime = await networkHelpers.time.latest();
      // 读取合约中的 donateDeadline 状态变量
      const deadline = await contract.donateDeadline();
      // 断言：deadline = 部署时的时间戳 + 30 天（30 × 86400 秒）
      // BigInt() 将 number 转成 bigint 再参与 BigInt 运算
      expect(deadline).to.equal(BigInt(latestBlockTime) + 30n * 86400n);
    });
  });
});
