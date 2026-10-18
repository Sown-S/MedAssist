// Kiểm tra chứng chỉ máy chủ theo CA của dự án (thuần Node, không phụ thuộc Electron — để kiểm thử được).
// req: { hostname, certificate } theo setCertificateVerifyProc của Electron (certificate.data = PEM, certificate.issuerCert = cấp trên).
// Nhận khi: chứng chỉ lá còn hạn, khớp tên máy / IP, và ĐI ĐÚNG CHUỖI từ lá lên: mỗi chứng chỉ do chính chứng chỉ kế trên ký
// (cấp trên phải là CA, còn hạn), cho tới khi gặp chứng chỉ do một CA của dự án ký.
// Chỉ hỏi "trong chuỗi có chứng chỉ nào do CA dự án ký" là SAI: kẻ tấn công chèn chính CA dự án (tự ký) vào chuỗi giả là qua.
import { X509Certificate } from 'crypto'

const valid = (c, now) => new Date(c.validFrom).getTime() <= now && now <= new Date(c.validTo).getTime()
const signedBy = (c, issuer) => c.checkIssued(issuer) && c.verify(issuer.publicKey)

export function verifyAgainstCAs(req, cas, now = Date.now()) {
  if (!req?.certificate || !cas?.length) return false
  const chain = []
  for (let c = req.certificate; c && chain.length < 8; c = c.issuerCert) chain.push(new X509Certificate(c.data))
  const leaf = chain[0]
  if (!valid(leaf, now) || !(leaf.checkHost(req.hostname) || leaf.checkIP(req.hostname))) return false
  for (let i = 0; i < chain.length; i++) {
    const cur = chain[i]
    if (cas.some((ca) => valid(ca, now) && signedBy(cur, ca))) return true
    const up = chain[i + 1]
    if (!up || !up.ca || !valid(up, now) || !signedBy(cur, up)) return false
  }
  return false
}
