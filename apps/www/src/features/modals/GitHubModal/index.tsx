import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Button,
  Text,
  Anchor,
  Alert,
  Badge,
  Group,
  Divider,
  PasswordInput,
  List,
} from "@mantine/core";
import { FaGithub } from "react-icons/fa6";
import { LuCheck, LuCircleX, LuShieldCheck } from "react-icons/lu";
import useGitHub from "../../../store/useGitHub";

const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=repo,read:user&description=JSONCrack";

export const GitHubModal = ({ opened, onClose }: ModalProps) => {
  const storedToken = useGitHub(state => state.token);
  const setToken = useGitHub(state => state.setToken);
  const clearToken = useGitHub(state => state.clearToken);

  const [inputValue, setInputValue] = React.useState("");
  const [validating, setValidating] = React.useState(false);
  const [validUser, setValidUser] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const hasToken = Boolean(storedToken);

  const handleClose = () => {
    setInputValue("");
    setValidUser(null);
    setError(null);
    onClose();
  };

  const validateAndSave = async () => {
    const token = inputValue.trim();
    if (!token) return;

    setValidating(true);
    setError(null);
    setValidUser(null);

    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError("Token ไม่ถูกต้อง หรือหมดอายุแล้ว กรุณาตรวจสอบและลองใหม่อีกครั้ง");
        } else {
          setError(`GitHub API ตอบกลับ: ${res.status} ${res.statusText}`);
        }
        return;
      }

      const user = await res.json();
      setToken(token);
      setValidUser(user.login as string);
      setInputValue("");
    } catch {
      setError("ไม่สามารถเชื่อมต่อ GitHub API ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต");
    } finally {
      setValidating(false);
    }
  };

  const handleRemove = () => {
    clearToken();
    setValidUser(null);
    setInputValue("");
    setError(null);
  };

  return (
    <Modal
      title={
        <Group gap="xs">
          <FaGithub size={18} />
          <Text fw={600}>GitHub Configuration</Text>
        </Group>
      }
      opened={opened}
      onClose={handleClose}
      centered
      size="md"
    >
      <Stack gap="md">
        {/* Status badge */}
        <Group>
          <Text size="sm" c="dimmed">
            สถานะการเชื่อมต่อ:
          </Text>
          {hasToken ? (
            <Badge color="green" leftSection={<LuCheck size={12} />}>
              เชื่อมต่อแล้ว
            </Badge>
          ) : (
            <Badge color="gray" leftSection={<LuCircleX size={12} />}>
              ยังไม่ได้เชื่อมต่อ
            </Badge>
          )}
        </Group>

        {/* Success state */}
        {(hasToken || validUser) && (
          <Alert color="green" icon={<LuCheck />} title="เชื่อมต่อสำเร็จ">
            {validUser
              ? `ยืนยันตัวตนสำเร็จ: @${validUser}`
              : "Token ถูกบันทึกไว้แล้ว (เชื่อมต่อไว้ก่อนหน้า)"}
          </Alert>
        )}

        <Divider />

        {/* How to generate token */}
        <Stack gap="xs">
          <Text size="sm" fw={600}>
            วิธีสร้าง Personal Access Token
          </Text>
          <List size="sm" spacing="xs">
            <List.Item>
              ไปที่{" "}
              <Anchor href={TOKEN_URL} target="_blank" rel="noopener" size="sm">
                GitHub → Settings → Tokens
              </Anchor>
            </List.Item>
            <List.Item>เลือก scope: <strong>repo</strong> และ <strong>read:user</strong></List.Item>
            <List.Item>คลิก Generate token แล้ว copy ค่าที่ได้มาใส่ด้านล่าง</List.Item>
          </List>
        </Stack>

        {/* Token input */}
        <PasswordInput
          label="Personal Access Token"
          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
          value={inputValue}
          onChange={e => setInputValue(e.currentTarget.value)}
          onKeyDown={e => {
            if (e.key === "Enter") validateAndSave();
          }}
          error={error}
          disabled={validating}
          data-autofocus
        />

        {/* Security note */}
        <Alert color="blue" icon={<LuShieldCheck />} title="ความปลอดภัย">
          <Text size="xs">
            Token ถูกเก็บใน <strong>localStorage</strong> ของเบราว์เซอร์เท่านั้น ไม่ได้ส่งไปยัง
            server ใดๆ ควรใช้ token ที่มี scope เท่าที่จำเป็นเท่านั้น และตั้ง expiration date ไว้ด้วย
          </Text>
        </Alert>

        {/* Actions */}
        <Group justify="space-between">
          {hasToken && (
            <Button variant="subtle" color="red" onClick={handleRemove} size="sm">
              ลบ Token ออก
            </Button>
          )}
          <Group ml="auto">
            <Button variant="default" onClick={handleClose} size="sm">
              ปิด
            </Button>
            <Button
              onClick={validateAndSave}
              loading={validating}
              disabled={!inputValue.trim()}
              size="sm"
            >
              ตรวจสอบและบันทึก
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
};
