const fs = require('fs').promises // 异步方法
const fsSync = require('fs') // 同步方法
const path = require('path')
const NodeRSA = require('node-rsa')
const createError = require('http-errors')
const { config } = require('process')
const mongoPage = require('mongoose-sex-page')

const rsaConfig = {
  authPath: './auth',  // 密钥存储路径
  schema: "pkcs1_oaep",  // 加密方案
  enCod: 'base64',  // 加密编码
  deCod: 'utf8' // 解密编码
}

/**
 * 创建秘钥
 * 一次通信过程只需要发生一次
 * pem: 推荐的秘钥保存格式
 */
async function generateKeys() {
  try {
    // 1 创建RSA密钥对
    const key = new NodeRSA({ b: 2048 })

    // 2 设置加密方案 (规定加密标准)
    key.setOptions({ encryptionScheme: rsaConfig.schema })

    // 3 导出秘钥
    const publicKey = key.exportKey('pkcs1-public-pem')
    const privateKey = key.exportKey('pkcs1-private-pem')

    // 4 确保目录存在
    await fs.mkdir(rsaConfig.authPath, { recursive: true })

    // 5 异步写入文件
    // 采用并行写入提升效率
    await Promise.all([
      fs.writeFile(path.join(rsaConfig.authPath, 'private.pem'), privateKey),
      fs.writeFile(path.join(rsaConfig.authPath, 'public.pem'), publicKey)
    ])

    return { publicKey, privateKey }
  } catch (error) {
    console.error('秘钥生成失败:', error)
    throw error
  }
}

// 加密
async function encrypt(data) {
  try {
    // 1 读取公钥文件
    let public_key = await fs.readFile(path.join(rsaConfig.authPath, 'public.pem'), { encoding: 'utf8' })
    // 2 创建 NodeRSA 实例
    const nodersa = new NodeRSA(public_key)
    // 3 设置加密方案 (实际加密方案)
    nodersa.setOptions({ encryptionScheme: rsaConfig.schema })
    // 4 加密明文为 Base64 格式
    const res = nodersa.encrypt(data, rsaConfig.enCod)
    return res
  } catch (error) {
    console.error('加密发生错误:', error)
    return false
  }
}

// 解密
async function decrypt(data) {
  try {
    // 读取私钥文件
    let private_key = await fs.readFile(path.join(rsaConfig.authPath, 'private.pem'), 'utf8')
    // 创建 NodeRSA 实例
    const nodersa = new NodeRSA(private_key)
    //设置加密方案 (与前端对应)
    nodersa.setOptions({
      encryptionScheme: {
        scheme: 'pkcs1_oaep',
        hash: 'sha1',      // 必须与前端一致：SHA-256
        mgf: 'mgf1',         // MGF1 函数
        mgf1Hash: 'sha1'   // MGF1 使用的哈希：SHA-256
      }
    });
    // 解密密文为 UTF-8 文本
    const res = nodersa.decrypt(data, rsaConfig.deCod)
    // 错误时返回 false
    return res
  } catch (error) {
    console.error('解密发生错误:', error)
    return false
  }
}

// 同步加密方法
function encryptSync(data) {
  try {
    // 使用同步文件读取
    const public_key = fsSync.readFileSync(path.join(rsaConfig.authPath, 'public.pem'), { encoding: 'utf8' })
    const nodersa = new NodeRSA(public_key)
    nodersa.setOptions({ encryptionScheme: rsaConfig.schema })
    const res = nodersa.encrypt(data, rsaConfig.enCod)
    return res
  } catch (error) {
    console.error('加密发生错误:', error)
    return false
  }
}


// 更具有健壮性: 解构赋值和默认值
async function pagination({ model, query, options, populate = {}, sort = {}, size, page, dis }) {
  let queryBuilder = mongoPage(model)
    .find(query)

  // mongoose-sex-page 的 .populate() 要求每个路径单独调用一次
  // 传数组 → 被包成 [[...]] → apply 展开后 mongoose 收到多参数 → 报错
  // 所以数组必须逐个调用：.populate(obj1).populate(obj2).populate(obj3)
  if (Array.isArray(populate) && populate.length > 0) {
    populate.forEach(p => { queryBuilder = queryBuilder.populate(p) })
  } else if (populate && typeof populate === 'object' && Object.keys(populate).length > 0) {
    queryBuilder = queryBuilder.populate(populate)
  }

  // sort 参数：mongoose-sex-page 通过 .sort() 链式调用
  if (sort && Object.keys(sort).length > 0) {
    queryBuilder = queryBuilder.sort(sort)
  }

  let result = await queryBuilder
    .select(options)
    .size(size)
    .page(page)
    .display(dis)
    .exec()

  let { total, records: list, pages, display } = result
  let count = list.length
  return { count, page, size, total, list, pages, display }
}

// 同步解密函数（使用NodeRSA，供setter使用）
function decryptSync(encryptedData) {
  try {

    // 1. 读取私钥文件（同步）
    const privateKeyPath = path.join(rsaConfig.authPath, 'private.pem');
    const private_key = fsSync.readFileSync(privateKeyPath, 'utf8');

    // 2. 创建 NodeRSA 实例
    const nodersa = new NodeRSA(private_key);

    // 3. 设置加密方案（与异步版本和前端对应）
    nodersa.setOptions({
      encryptionScheme: {
        scheme: 'pkcs1_oaep',
        hash: 'sha1',
        mgf: 'mgf1',
        mgf1Hash: 'sha1'
      }
    });

    // 4. 解密密文为 UTF-8 文本
    const res = nodersa.decrypt(encryptedData, rsaConfig.deCod);

    // 5. 验证解密结果
    if (!res) {
      throw new Error('解密返回空值');
    }

    console.log('同步解密成功:', res.substring(0, 20) + '...');
    return res;

  } catch (error) {
    console.error('同步解密失败:', error.message);
    throw error;
  }
}


// 关联查询辅助：对 mongoose query 应用 populate
function populate(queries, pop) {
  if (!pop || Object.keys(pop).length === 0) return queries
  return queries.populate(pop)
}


module.exports = { generateKeys, encrypt, decrypt, encryptSync, decryptSync, pagination, populate }
