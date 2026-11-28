// Stylelint chỉ bật các luật bắt LỖI (giá trị sai, thuộc tính không tồn tại, khai báo trùng…), không ép kiểu viết:
// CSS của app viết gọn một dòng một luật, đổi định dạng hàng loạt sẽ làm diff khó đọc. Biến/luật chết: tests/css.test.js.
export default {
  rules: {
    'color-no-invalid-hex': true,
    'function-calc-no-unspaced-operator': true,
    'function-linear-gradient-no-nonstandard-direction': true,
    'string-no-newline': true,
    'unit-no-unknown': true,
    'property-no-unknown': true,
    'declaration-block-no-duplicate-properties': [true, { ignore: ['consecutive-duplicates-with-different-values'] }],
    'declaration-block-no-shorthand-property-overrides': true,
    'block-no-empty': true,
    'selector-pseudo-class-no-unknown': true,
    'selector-pseudo-element-no-unknown': true,
    'selector-type-no-unknown': [true, { ignore: ['custom-elements'] }],
    'media-feature-name-no-unknown': true,
    'at-rule-no-unknown': true,
    'comment-no-empty': true,
    'no-invalid-double-slash-comments': true,
    'no-invalid-position-at-import-rule': true,
    'keyframe-declaration-no-important': true,
    'named-grid-areas-no-invalid': true,
    'no-duplicate-at-import-rules': true,
    'font-family-no-duplicate-names': true,
    'custom-property-no-missing-var-function': true
  }
}
