// @ts-ignore
import { ethers } from "hardhat";
import {
  BadBidder,
  AuctionHouse,
  WFTM,
  BadERC721,
  TestERC721,
} from "../typechain";
import { sha256 } from "ethers/lib/utils";
import Decimal from "../utils/Decimal";
import { BigNumber } from "ethers";

export const THOUSANDTH_ETH = ethers.utils.parseUnits(
  "0.001",
  "ether"
) as BigNumber;
export const TENTH_ETH = ethers.utils.parseUnits("0.1", "ether") as BigNumber;
export const ONE_ETH = ethers.utils.parseUnits("1", "ether") as BigNumber;
export const TWO_ETH = ethers.utils.parseUnits("2", "ether") as BigNumber;

export const deployWFTM = async () => {
  const [deployer] = await ethers.getSigners();
  return (await (await ethers.getContractFactory("WFTM")).deploy()) as WFTM;
};

export const deployOtherNFTs = async () => {
  const bad = (await (
    await ethers.getContractFactory("BadERC721")
  ).deploy()) as BadERC721;
  const test = (await (
    await ethers.getContractFactory("TestERC721")
  ).deploy()) as TestERC721;

  return { bad, test };
};

export const deployBidder = async (auction: string) => {
  return (await (
    await (await ethers.getContractFactory("BadBidder")).deploy(
      auction
    )
  ).deployed()) as BadBidder;
};

export const revert = (messages: TemplateStringsArray) =>
  `VM Exception while processing transaction: revert ${messages[0]}`;
