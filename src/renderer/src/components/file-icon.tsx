import {
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  FileImageOutlined,
  FileZipOutlined,
  FileMarkdownOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FileOutlined
} from '@ant-design/icons'

/** 扩展名（小写无点）到 antd 图标的映射；未知类型回退 FileOutlined。 */
export function fileIconFor(ext: string): JSX.Element {
  switch (ext) {
    case 'pdf':
      return <FilePdfOutlined style={{ color: '#e64a19' }} />
    case 'xls':
    case 'xlsx':
    case 'csv':
      return <FileExcelOutlined style={{ color: '#2e7d32' }} />
    case 'doc':
    case 'docx':
      return <FileWordOutlined style={{ color: '#1565c0' }} />
    case 'ppt':
    case 'pptx':
      return <FilePptOutlined style={{ color: '#ef6c00' }} />
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'bmp':
    case 'webp':
      return <FileImageOutlined style={{ color: '#6a1b9a' }} />
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return <FileZipOutlined style={{ color: '#5d4037' }} />
    case 'md':
      return <FileMarkdownOutlined style={{ color: '#37474f' }} />
    case 'txt':
    case 'log':
      return <FileTextOutlined style={{ color: '#455a64' }} />
    default:
      return <FileOutlined style={{ color: '#90a4ae' }} />
  }
}
