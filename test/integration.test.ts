// @ts-ignore
import { ethers } from "hardhat";
import chai, { expect } from "chai";
import asPromised from "chai-as-promised";
import {
  deployOtherNFTs,
  deployWFTM,
  ONE_ETH,
  TENTH_ETH,
  THOUSANDTH_ETH,
  TWO_ETH,
} from "./utils";
import { BigNumber, Signer } from "ethers";
import { AuctionHouse, TestERC721, WFTM } from "../typechain";

chai.use(asPromised);

const ONE_DAY = 24 * 60 * 60;

// helper function so we can parse numbers and do approximate number calculations, to avoid annoying gas calculations
const smallify = (bn: BigNumber) => bn.div(THOUSANDTH_ETH).toNumber();

describe("integration", () => {
  let wftm: WFTM;
  let auction: AuctionHouse;
  let otherNft: TestERC721;
  let deployer, creator, owner, curator, bidderA, bidderB, otherUser: Signer;
  let deployerAddress,
    ownerAddress,
    creatorAddress,
    curatorAddress,
    bidderAAddress,
    bidderBAddress,
    otherUserAddress: string;

  async function deploy(): Promise<AuctionHouse> {
    const AuctionHouse = await ethers.getContractFactory("AuctionHouse");
    const auctionHouse = await AuctionHouse.deploy(wftm.address);

    return auctionHouse as AuctionHouse;
  }

  beforeEach(async () => {
    await ethers.provider.send("hardhat_reset", []);
    [
      deployer,
      creator,
      owner,
      curator,
      bidderA,
      bidderB,
      otherUser,
    ] = await ethers.getSigners();
    [
      deployerAddress,
      creatorAddress,
      ownerAddress,
      curatorAddress,
      bidderAAddress,
      bidderBAddress,
      otherUserAddress,
    ] = await Promise.all(
      [deployer, creator, owner, curator, bidderA, bidderB].map((s) =>
        s.getAddress()
      )
    );
    const nfts = await deployOtherNFTs();
    wftm = await deployWFTM();
    auction = await deploy();
    otherNft = nfts.test;
    await otherNft.mint(creator.address, 0);
    await otherNft
      .connect(creator)
      .transferFrom(creatorAddress, ownerAddress, 0);
  });

  describe("FTM Auction with no curator", async () => {
    async function run() {
        await otherNft.connect(owner).approve(auction.address, 0);
      await auction
        .connect(owner)
        .createAuction(
          0,
          otherNft.address,
          ONE_DAY,
          TENTH_ETH,
          ethers.constants.AddressZero,
          0,
          ethers.constants.AddressZero
        );
      await auction.connect(bidderA).createBid(0, ONE_ETH, { value: ONE_ETH });
      await auction.connect(bidderB).createBid(0, TWO_ETH, { value: TWO_ETH });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await auction.connect(otherUser).endAuction(0);
    }

    it("should transfer the NFT to the winning bidder", async () => {
      await run();
        expect(await otherNft.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderBAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderBAddress);

      expect(smallify(beforeBalance.sub(afterBalance))).to.be.approximately(
        smallify(TWO_ETH),
        smallify(TENTH_ETH)
      );
    });

    it("should refund the losing bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderAAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderAAddress);

      expect(smallify(beforeBalance)).to.be.approximately(
        smallify(afterBalance),
        smallify(TENTH_ETH)
      );
    });

    it("should pay the auction creator", async () => {
      const beforeBalance = await ethers.provider.getBalance(ownerAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(ownerAddress);

      // 0% creator fee -> 2ETH * 100% = 2 ETH
      expect(smallify(afterBalance)).to.be.approximately(
        smallify(beforeBalance.add(TENTH_ETH.mul(20))),
        smallify(TENTH_ETH)
      );
    });

  });

  describe("ETH auction with curator", () => {
    async function run() {
        await otherNft.connect(owner).approve(auction.address, 0);
      await auction
        .connect(owner)
        .createAuction(
          0,
            otherNft.address,
          ONE_DAY,
          TENTH_ETH,
          curatorAddress,
          20,
          ethers.constants.AddressZero
        );
      await auction.connect(curator).setAuctionApproval(0, true);
      await auction.connect(bidderA).createBid(0, ONE_ETH, { value: ONE_ETH });
      await auction.connect(bidderB).createBid(0, TWO_ETH, { value: TWO_ETH });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await auction.connect(otherUser).endAuction(0);
    }

    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await otherNft.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderBAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderBAddress);

      expect(smallify(beforeBalance.sub(afterBalance))).to.be.approximately(
        smallify(TWO_ETH),
        smallify(TENTH_ETH)
      );
    });

    it("should refund the losing bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderAAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderAAddress);

      expect(smallify(beforeBalance)).to.be.approximately(
        smallify(afterBalance),
        smallify(TENTH_ETH)
      );
    });

    it("should pay the auction creator", async () => {
      const beforeBalance = await ethers.provider.getBalance(ownerAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(ownerAddress);

      expect(smallify(afterBalance)).to.be.approximately(
        // 20% curator fee  -> 2 ETH * 80% = 1.6 ETH
        smallify(beforeBalance.add(TENTH_ETH.mul(16))),
        smallify(TENTH_ETH)
      );
    });

    it("should pay the curator", async () => {
      const beforeBalance = await ethers.provider.getBalance(curatorAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(curatorAddress);

      // 20% of 2 WETH -> 0.4
      expect(smallify(afterBalance)).to.be.approximately(
        smallify(beforeBalance.add(THOUSANDTH_ETH.mul(400))),
        smallify(TENTH_ETH)
      );
    });
  });

  describe("WETH Auction with no curator", () => {
    async function run() {
        otherNft.connect(owner).approve(auction.address, 0);
      await auction
        .connect(owner)
        .createAuction(
          0,
            otherNft.address,
          ONE_DAY,
          TENTH_ETH,
          ethers.constants.AddressZero,
          20,
          wftm.address
        );
      await wftm.connect(bidderA).deposit({ value: ONE_ETH });
      await wftm.connect(bidderA).approve(auction.address, ONE_ETH);
      await wftm.connect(bidderB).deposit({ value: TWO_ETH });
      await wftm.connect(bidderB).approve(auction.address, TWO_ETH);
      await auction.connect(bidderA).createBid(0, ONE_ETH, { value: ONE_ETH });
      await auction.connect(bidderB).createBid(0, TWO_ETH, { value: TWO_ETH });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await auction.connect(otherUser).endAuction(0);
    }

    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await otherNft.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      await run();
      const afterBalance = await wftm.balanceOf(bidderBAddress);

      expect(afterBalance).to.eq(ONE_ETH.mul(0));
    });

    it("should refund the losing bidder", async () => {
      await run();
      const afterBalance = await wftm.balanceOf(bidderAAddress);

      expect(afterBalance).to.eq(ONE_ETH);
    });

    it("should pay the auction creator", async () => {
      await run();
      const afterBalance = await wftm.balanceOf(ownerAddress);

      // 2 ETH
      expect(afterBalance).to.eq(TENTH_ETH.mul(20));
    });

  });

  describe("WETH auction with curator", async () => {
    async function run() {
      await otherNft.connect(owner).approve(auction.address, 0);
      await auction
        .connect(owner)
        .createAuction(
          0,
          otherNft.address,
          ONE_DAY,
          TENTH_ETH,
          curator.address,
          20,
          wftm.address
        );
      await auction.connect(curator).setAuctionApproval(0, true);
      await wftm.connect(bidderA).deposit({ value: ONE_ETH });
      await wftm.connect(bidderA).approve(auction.address, ONE_ETH);
      await wftm.connect(bidderB).deposit({ value: TWO_ETH });
      await wftm.connect(bidderB).approve(auction.address, TWO_ETH);
      await auction.connect(bidderA).createBid(0, ONE_ETH, { value: ONE_ETH });
      await auction.connect(bidderB).createBid(0, TWO_ETH, { value: TWO_ETH });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await auction.connect(otherUser).endAuction(0);
    }

    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await otherNft.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      await run();
      const afterBalance = await wftm.balanceOf(bidderBAddress);

      expect(afterBalance).to.eq(ONE_ETH.mul(0));
    });

    it("should refund the losing bidder", async () => {
      await run();
      const afterBalance = await wftm.balanceOf(bidderAAddress);

      expect(afterBalance).to.eq(ONE_ETH);
    });

    it("should pay the auction creator", async () => {
      await run();
      const afterBalance = await wftm.balanceOf(ownerAddress);

      // 20% curator fee -> 2 ETH * 80% = 1.6WETH
      expect(afterBalance).to.eq(THOUSANDTH_ETH.mul(1600));
    });

    it("should pay the auction curator", async () => {
      const beforeBalance = await wftm.balanceOf(curatorAddress);
      await run();
      const afterBalance = await wftm.balanceOf(curatorAddress);

      // 20% curator fee = 2 ETH * 20% = 0.4 WETH
      expect(afterBalance).to.eq(beforeBalance.add(THOUSANDTH_ETH.mul(400)));
    });
  });

  describe("3rd party nft auction", async () => {
    async function run() {
      await otherNft.connect(owner).approve(auction.address, 0);
      await auction
        .connect(owner)
        .createAuction(
          0,
          otherNft.address,
          ONE_DAY,
          TENTH_ETH,
          curatorAddress,
          20,
          ethers.constants.AddressZero
        );
      await auction.connect(curator).setAuctionApproval(0, true);
      await auction.connect(bidderA).createBid(0, ONE_ETH, { value: ONE_ETH });
      await auction.connect(bidderB).createBid(0, TWO_ETH, { value: TWO_ETH });
      await ethers.provider.send("evm_setNextBlockTimestamp", [
        Date.now() + ONE_DAY,
      ]);
      await auction.connect(otherUser).endAuction(0);
    }
    it("should transfer the NFT to the winning bidder", async () => {
      await run();
      expect(await otherNft.ownerOf(0)).to.eq(bidderBAddress);
    });

    it("should withdraw the winning bid amount from the winning bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderBAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderBAddress);

      expect(smallify(beforeBalance.sub(afterBalance))).to.be.approximately(
        smallify(TWO_ETH),
        smallify(TENTH_ETH)
      );
    });

    it("should refund the losing bidder", async () => {
      const beforeBalance = await ethers.provider.getBalance(bidderAAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(bidderAAddress);

      expect(smallify(beforeBalance)).to.be.approximately(
        smallify(afterBalance),
        smallify(TENTH_ETH)
      );
    });

    it("should pay the auction creator", async () => {
      const beforeBalance = await ethers.provider.getBalance(ownerAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(ownerAddress);

      expect(smallify(afterBalance)).to.be.approximately(
        // 20% curator fee  -> 2 ETH * 80% = 1.6 ETH
        smallify(beforeBalance.add(TENTH_ETH.mul(16))),
        smallify(TENTH_ETH)
      );
    });

    it("should pay the curator", async () => {
      const beforeBalance = await ethers.provider.getBalance(curatorAddress);
      await run();
      const afterBalance = await ethers.provider.getBalance(curatorAddress);

      // 20% of 2 WETH -> 0.4
      expect(smallify(afterBalance)).to.be.approximately(
        smallify(beforeBalance.add(TENTH_ETH.mul(4))),
        smallify(THOUSANDTH_ETH)
      );
    });
  });
});
