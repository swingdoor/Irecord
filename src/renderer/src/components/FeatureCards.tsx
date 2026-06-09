import { Card, Button, Row, Col, Typography, Space } from 'antd'
import { AudioOutlined, UploadOutlined, FileTextOutlined } from '@ant-design/icons'

const { Text } = Typography

interface FeatureCardsProps {
  onUpload: () => void
  onRecord: () => void
  onCreateDoc: () => void
}

export function FeatureCards({ onUpload, onRecord, onCreateDoc }: FeatureCardsProps) {
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Card style={{ height: '100%' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <AudioOutlined style={{ fontSize: 24 }} />
              <Text strong>实时录音</Text>
            </Space>
            <Text type="secondary">麦克风录音，录音完成后可转文字</Text>
            <Button icon={<AudioOutlined />} block onClick={onRecord}>
              开始录音
            </Button>
          </Space>
        </Card>
      </Col>
      <Col span={8}>
        <Card style={{ height: '100%' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <UploadOutlined style={{ fontSize: 24 }} />
              <Text strong>上传音视频</Text>
            </Space>
            <Text type="secondary">支持音视频文件转文字，结果可导出</Text>
            <Button icon={<UploadOutlined />} block onClick={onUpload}>立即上传</Button>
          </Space>
        </Card>
      </Col>
      <Col span={8}>
        <Card style={{ height: '100%' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <Space>
              <FileTextOutlined style={{ fontSize: 24 }} />
              <Text strong>知识整理</Text>
            </Space>
            <Text type="secondary">基于识别结果，AI 生成结构化文档</Text>
            <Button icon={<FileTextOutlined />} block onClick={onCreateDoc}>新建文档</Button>
          </Space>
        </Card>
      </Col>
    </Row>
  )
}
