# aws-cdk-s3-deployment-with-ec2


## 構成図

![](architecture.drawio.png)

## SSH アクセス (EC2)

```bash
EC2_INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=AwsCdkS3DeploymentWithEc2Stack/General_purpose_ec2" \
    --query "Reservations[].Instances[?State.Name=='running'].InstanceId[]" \
    --output text)
ssh -i ~/.ssh/ec2/id_ed25519 admis@$EC2_INSTANCE_ID
```

## SSH アクセス (NAT)

※ SSM 用の iam role を付けていないので，そのままでは接続できない．

```bash
NAT_INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=AwsCdkS3DeploymentWithEc2Stack/NatInstance" \
    --query "Reservations[].Instances[?State.Name=='running'].InstanceId[]" \
    --output text)
ssh -i ~/.ssh/ec2/id_ed25519 admis@$NAT_INSTANCE_ID
```

## cloud-config のログ確認

```bash
sudo cat /var/log/cloud-init-output.log
```

---

## 付録

### Nodejs のインストール

https://nodejs.org/en/download/releases/ から好きなバージョンを探す．
特にこだわりが無ければ，[サポートサイクルから LTS のバージョン](https://endoflife.date/nodejs) を選択する．

```bash
curl -SLO "https://nodejs.org/dist/latest-v12.x/node-v12.22.3-linux-x64.tar.xz"
sudo tar -xJf ./node-v12.22.3-linux-x64.tar.xz -C /usr/local --strip-components=1 --no-same-owner
rm ./node-v12.22.3-linux-x64.tar.xz
sudo ln -s /usr/local/binnode /usr/local/bin/nodejs
```

### CDK プロジェクトの作成
1. README なしで git リポジトリを生成
2. git clone して cd リポジトリの中に入る
3. CDK の Typescript プロジェクトを作成
   ```bash
   npx cdk init sample-app --language typescript
   ```

### 静的検査
```bash
npx cdk synth
```

### テスト
```
npx npm run test
```
```
npx npm run test -- -u
```

### デプロイ
```bash
npx cdk deploy --all --require-approval never
```
```bash
npx cdk destroy --all --force
```

