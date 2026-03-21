import React from "react";
import { Flex, Group, Select, TextInput, ActionIcon } from "@mantine/core";
import styled from "styled-components";
import toast from "react-hot-toast";
import { AiOutlineFullscreen } from "react-icons/ai";
import { FaGithub } from "react-icons/fa6";
import { FaCog } from "react-icons/fa";
import { LuSearch } from "react-icons/lu";
import { JSONCrackLogo } from "../../../layout/JSONCrackBrandLogo";
import { useModal } from "../../../store/useModal";
import useGitHub from "../../../store/useGitHub";
import useFile from "../../../store/useFile";
import { FileFormat } from "../../../enums/file.enum";
import { FileMenu } from "./FileMenu";
import { ThemeToggle } from "./ThemeToggle";
import { ToolsMenu } from "./ToolsMenu";
import { ViewMenu } from "./ViewMenu";
import { StyledToolElement } from "./styles";

const StyledTools = styled.div`
  position: relative;
  display: flex;
  width: 100%;
  align-items: center;
  gap: 4px;
  justify-content: space-between;
  height: 45px;
  padding: 6px 12px;
  background: ${({ theme }) => theme.TOOLBAR_BG};
  color: ${({ theme }) => theme.SILVER};
  z-index: 36;
  border-bottom: 1px solid ${({ theme }) => theme.SILVER_DARK};

  @media only screen and (max-width: 320px) {
    display: none;
  }
`;

function fullscreenBrowser() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {
      toast.error("Unable to enter fullscreen mode.");
    });
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
}

export const Toolbar = () => {
  const setVisible = useModal(state => state.setVisible);
  const hasGitHubToken = useGitHub(state => Boolean(state.token));
  const token = useGitHub(state => state.token);
  const policyConfig = useGitHub(state => state.policyConfig);
  const setPolicyConfig = useGitHub(state => state.setPolicyConfig);
  const setContents = useFile(state => state.setContents);
  const [isSearching, setIsSearching] = React.useState(false);

  const fileTypeOptions = [
    { value: "SPEC", label: "SPEC" },
    { value: "CFS", label: "CFS" },
    { value: "RFS", label: "RFS" },
    { value: "GROUP", label: "GROUP" },
    { value: "RULE", label: "RULE" },
    { value: "SET", label: "SET" },
  ];

  const handleFileTypeChange = (value: string | null) => {
    setPolicyConfig({
      ...policyConfig,
      fileType: value as any,
    });
  };

  const handleSearchTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPolicyConfig({
      ...policyConfig,
      searchText: e.currentTarget.value,
    });
  };

  const getPathForFileType = (fileType: string, searchText: string): string => {
    const pathMap: Record<string, string> = {
      SPEC: `onboarding_activity/config/Policy/Spec/${searchText}.json`,
      CFS: `onboarding_activity/config/CFS/${searchText}.json`,
      RFS: `onboarding_activity/config/RFS/${searchText}.json`,
      GROUP: `onboarding_activity/config/Policy/Group/${searchText}.json`,
      RULE: `onboarding_activity/config/Policy/Rule/${searchText}.json`,
      SET: `onboarding_activity/config/Policy/Set/${searchText}.json`,
    };
    return pathMap[fileType] || "";
  };

  const handleSearch = async () => {
    if (!policyConfig.fileType || !policyConfig.searchText || !token) {
      toast.error("กรุณาเลือก File Type และใส่คำค้นหา");
      return;
    }

    if (!policyConfig.productLine || !policyConfig.activity) {
      toast.error("กรุณาตั้งค่า Product Line และ Activity ใน Policy Config ก่อน");
      return;
    }

    setIsSearching(true);

    console.group("🔍 Policy File Search");
    console.log("📋 Policy Config:", policyConfig);
    console.warn("⚠️ ถ้าหาไม่เจอ ให้ตรวจสอบ:");
    console.warn("   1. Branch ถูกต้องหรือไม่? (Activity Branch)");
    console.warn("   2. Activity Repository ถูกหรือไม่?");
    console.warn("   3. File Type ตรงกับ path หรือไม่?");
    
    toast.loading(`กำลังค้นหา ${policyConfig.searchText}.json...`, { id: "search-policy" });
    
    try {
      const filePath = getPathForFileType(policyConfig.fileType, policyConfig.searchText);
      const activityBranch = policyConfig.activityBranch;
      
      // Try activity repo first
      const activityUrl = `https://api.github.com/repos/${policyConfig.activity}/contents/${filePath}?ref=${activityBranch}`;
      
      console.log("\n🎯 Step 1: Activity Repo (ค้นหาที่นี่ก่อน)");
      console.log("URL:", activityUrl);
      console.log("Repo:", policyConfig.activity);
      console.log("Branch:", activityBranch);
      console.log("Path:", filePath);
      console.log("🔗 ทดสอบ URL ใน browser:", `https://github.com/${policyConfig.activity}/blob/${activityBranch}/${filePath}`);
      
      toast.loading(`กำลังค้นหาใน Activity Repo...`, { id: "search-policy" });
      
      let res = await fetch(activityUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      });

      console.log("Response:", res.status, res.statusText);

      let source = "";
      
      // If not found in activity, try common repo
      if (!res.ok) {
        const activityError = await res.json().catch(() => ({}));
        console.log("❌ Activity Result:", activityError.message || res.statusText);
        console.log("💡 ไม่พบใน Activity Repo ลอง Common Repo...");
        
        const commonRepo = `corp-ais/sky-${policyConfig.productLine}-onboarding-common`;
        const commonPath = filePath.replace("onboarding_activity", "onboarding_common");
        const commonBranch = policyConfig.commonBranch;
        const commonUrl = `https://api.github.com/repos/${commonRepo}/contents/${commonPath}?ref=${commonBranch}`;
        
        console.log("\n🎯 Step 2: Common Repo (Fallback)");
        console.log("URL:", commonUrl);
        console.log("Repo:", commonRepo);
        console.log("Branch:", commonBranch);
        console.log("Path:", commonPath);
        console.log("🔗 ทดสอบ URL ใน browser:", `https://github.com/${commonRepo}/blob/${commonBranch}/${commonPath}`);
        
        toast.loading(`ไม่พบใน Activity Repo, ลอง Common Repo...`, { id: "search-policy" });
        
        res = await fetch(commonUrl, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        });

        console.log("Response:", res.status, res.statusText);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.log("❌ Common Result:", errorData.message || res.statusText);
          console.groupEnd();
          
          const activityTestUrl = `https://github.com/${policyConfig.activity}/blob/${activityBranch}/${filePath}`;
          const commonTestUrl = `https://github.com/${commonRepo}/blob/${commonBranch}/${commonPath}`;
          
          throw new Error(
            `ไม่พบไฟล์ "${policyConfig.searchText}.json" ใน repo\n\n` +
            `⚠️ โปรแกรมค้นหาใน Activity Repo ก่อนเสมอ!\n\n` +
            `ช่องทางที่ลอง (ตามลำดับ):\n\n` +
            `1️⃣ Activity Repo: ${policyConfig.activity}\n` +
            `   Branch: ${activityBranch}\n` +
            `   Path: ${filePath}\n` +
            `   Status: ${activityError.message || "Not Found"}\n` +
            `   🔗 ทดสอบ: ${activityTestUrl}\n\n` +
            `2️⃣ Common Repo: ${commonRepo}\n` +
            `   Branch: ${commonBranch}\n` +
            `   Path: ${commonPath}\n` +
            `   Status: ${errorData.message || "Not Found"}\n` +
            `   🔗 ทดสอบ: ${commonTestUrl}\n\n` +
            `💡 แนะนำ:\n` +
            `   • เปิด Console (F12) ดู logs\n` +
            `   • คลิกลิงก์ 🔗 ด้านบนเพื่อทดสอบใน browser\n` +
            `   • ตรวจสอบ Activity Branch ใน Policy Config (ควรเป็น master หรือ develop?)`
          );
        }
        source = ` จาก ${commonRepo} (${commonBranch})`;
        console.log("✅ Found in Common Repo");
      } else {
        source = ` จาก ${policyConfig.activity} (${activityBranch})`;
        console.log("✅ Found in Activity Repo");
      }
      
      console.groupEnd();

      const data = await res.json();
      
      if (data.content) {
        const content = atob(data.content);
        setContents({ contents: content, format: FileFormat.JSON });
        toast.success(`โหลด ${policyConfig.searchText}.json สำเร็จ${source}`, { id: "search-policy" });
      } else {
        throw new Error("ไม่สามารถอ่านไฟล์ได้");
      }
    } catch (err) {
      console.groupEnd();
      console.error("❌ Search failed:", err);
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการค้นหา", { id: "search-policy" });
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <StyledTools>
      <Group gap="xs" justify="left" style={{ flexWrap: "nowrap", flex: "0 0 auto" }}>
        <StyledToolElement title="Policy Crack">
          <Flex gap="xs" align="center" justify="center">
            <JSONCrackLogo fontSize="14px" hideLogo />
          </Flex>
        </StyledToolElement>
        <FileMenu />
        <ViewMenu />
        <ToolsMenu />
      </Group>
      
      {/* Center Search Section */}
      {hasGitHubToken && (
        <Group gap="xs" justify="center" style={{ flexWrap: "nowrap", flex: "1 1 auto", maxWidth: "500px" }}>
          <Select
            placeholder="Type"
            data={fileTypeOptions}
            value={policyConfig.fileType}
            onChange={handleFileTypeChange}
            size="xs"
            style={{ width: "120px" }}
            clearable
          />
          <TextInput
            placeholder="Search spec, policy..."
            value={policyConfig.searchText}
            onChange={handleSearchTextChange}
            onKeyDown={handleKeyDown}
            size="xs"
            style={{ flex: 1, minWidth: "200px" }}
          />
          <ActionIcon
            onClick={handleSearch}
            loading={isSearching}
            disabled={!policyConfig.fileType || !policyConfig.searchText}
            variant="filled"
            color="blue"
            size="lg"
          >
            <LuSearch size={16} />
          </ActionIcon>
        </Group>
      )}
      
      <Group gap="xs" justify="right" style={{ flexWrap: "nowrap", flex: "0 0 auto" }}>
        <ThemeToggle />
        {hasGitHubToken && (
          <StyledToolElement
            title="Policy Config"
            onClick={() => setVisible("PolicyLoaderModal", true)}
            style={{ color: "#60a5fa" }}
          >
            <FaCog size="20" />
          </StyledToolElement>
        )}
        <StyledToolElement
          title={hasGitHubToken ? "GitHub (เชื่อมต่อแล้ว)" : "GitHub Config"}
          onClick={() => setVisible("GitHubModal", true)}
          style={{ color: hasGitHubToken ? "#4ade80" : undefined }}
        >
          <FaGithub size="20" />
        </StyledToolElement>
        <StyledToolElement title="Fullscreen" onClick={fullscreenBrowser}>
          <AiOutlineFullscreen size="20" />
        </StyledToolElement>
      </Group>
    </StyledTools>
  );
};
