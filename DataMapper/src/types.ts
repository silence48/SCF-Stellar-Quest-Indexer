export interface Badge {
  index: number;
  assetCode: string;
  assetIssuer: string;
  owner: string;
  balance: string;
  transactions: string[];
}

export interface Asset {
  code: string;
  issuer: string;
}
