import Icon from '../Icon'

// Ô "không có dữ liệu" dùng chung: biểu tượng tròn, tiêu đề, một dòng giải thích, và nút / nội dung thêm (children).
// title / text là chuỗi tiếng Anh: thẻ <b>/<span> tự dịch qua runtime JSX như mọi chữ giao diện khác.
export default function EmptyState({ icon = 'search', title, text, children, className = '' }) {
  return (
    <div className={'empty' + (className ? ' ' + className : '')}>
      <div className="ill">
        <Icon name={icon} />
      </div>
      {title && <b>{title}</b>}
      {text && <span>{text}</span>}
      {children}
    </div>
  )
}
