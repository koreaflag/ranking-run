import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../hooks/useTheme';
import BlurredBackground from '../../components/common/BlurredBackground';
import ScreenHeader from '../../components/common/ScreenHeader';
import { FONT_SIZES, SPACING, BORDER_RADIUS } from '../../utils/constants';
import type { ThemeColors } from '../../utils/constants';

const EFFECTIVE_DATE = '2026년 2월 23일';
const COMPANY_EMAIL = 'support@runvs.app';

export default function TermsOfServiceScreen() {
  const navigation = useNavigation();
  const colors = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <BlurredBackground>
      <SafeAreaView style={styles.container}>
        <ScreenHeader
          title="이용약관"
          onBack={() => navigation.goBack()}
        />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            <Text style={styles.effectiveDate}>시행일: {EFFECTIVE_DATE}</Text>

            {/* 제1조 */}
            <Text style={styles.sectionTitle}>제1조 (목적)</Text>
            <Text style={styles.paragraph}>
              이 약관은 RUNVS(이하 "회사")가 제공하는 런닝 코스 공유 서비스 "RUNVS"(이하 "서비스")의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임 사항, 기타 필요한 사항을 규정함을 목적으로 합니다.
            </Text>

            {/* 제2조 */}
            <Text style={styles.sectionTitle}>제2조 (정의)</Text>
            <Text style={styles.bullet}>① "서비스"란 회사가 제공하는 러닝 트래킹, 코스 제작·공유, 랭킹, 소셜 기능 등 관련 제반 서비스를 의미합니다.</Text>
            <Text style={styles.bullet}>② "이용자"란 이 약관에 따라 회사와 이용 계약을 체결하고 서비스를 이용하는 회원을 말합니다.</Text>
            <Text style={styles.bullet}>③ "코스"란 이용자가 러닝하며 GPS로 기록한 경로를 바탕으로 제작하여 다른 이용자와 공유하는 런닝 경로를 말합니다.</Text>
            <Text style={styles.bullet}>④ "랭킹"이란 특정 코스에서의 러닝 기록(시간, 페이스 등)을 기준으로 산정된 이용자 간 순위를 말합니다.</Text>
            <Text style={styles.bullet}>⑤ "콘텐츠"란 이용자가 서비스 내에서 생성한 코스, 리뷰, 프로필 정보 등 일체의 정보를 말합니다.</Text>

            {/* 제3조 */}
            <Text style={styles.sectionTitle}>제3조 (약관의 효력 및 변경)</Text>
            <Text style={styles.bullet}>① 이 약관은 서비스 화면에 게시하거나 기타의 방법으로 이용자에게 공지함으로써 효력이 발생합니다.</Text>
            <Text style={styles.bullet}>② 회사는 관련 법령을 위배하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경 시 적용일자 및 변경 사유를 명시하여 최소 7일 전에 앱 내 공지합니다.</Text>
            <Text style={styles.bullet}>③ 이용자가 변경된 약관에 동의하지 않을 경우 서비스 이용을 중단하고 회원 탈퇴를 할 수 있습니다. 변경된 약관의 효력 발생일 이후에도 서비스를 계속 이용할 경우 약관 변경에 동의한 것으로 간주합니다.</Text>

            {/* 제4조 */}
            <Text style={styles.sectionTitle}>제4조 (이용 계약의 체결)</Text>
            <Text style={styles.bullet}>① 이용 계약은 이용자가 약관에 동의하고 소셜 로그인(Apple 또는 Google)을 통해 회원 가입을 완료한 시점에 성립합니다.</Text>
            <Text style={styles.bullet}>② 회사는 다음 각 호에 해당하는 경우 이용 신청을 거부하거나 사후에 이용 계약을 해지할 수 있습니다.</Text>
            <Text style={styles.indent}>1. 타인의 정보를 도용한 경우</Text>
            <Text style={styles.indent}>2. 허위 정보를 기재한 경우</Text>
            <Text style={styles.indent}>3. 만 14세 미만인 경우</Text>
            <Text style={styles.indent}>4. 이전에 약관 위반으로 자격이 제한된 이용자가 재가입을 시도하는 경우</Text>
            <Text style={styles.indent}>5. 기타 관련 법령에 위반되거나 회사가 정한 이용 요건에 미달하는 경우</Text>

            {/* 제5조 */}
            <Text style={styles.sectionTitle}>제5조 (서비스의 제공 및 변경)</Text>
            <Text style={styles.bullet}>① 회사는 다음과 같은 서비스를 제공합니다.</Text>
            <Text style={styles.indent}>1. 러닝 트래킹: GPS 기반 실시간 러닝 기록 (거리, 페이스, 시간, 고도, 경로)</Text>
            <Text style={styles.indent}>2. 코스 제작 및 공유: 러닝 경로를 코스로 등록하고 다른 이용자와 공유</Text>
            <Text style={styles.indent}>3. 코스 탐색: 주변 코스 검색 및 지도 기반 탐색</Text>
            <Text style={styles.indent}>4. 랭킹: 코스별 러닝 기록 순위 제공</Text>
            <Text style={styles.indent}>5. 소셜 기능: 팔로우, 코스 리뷰, 이벤트</Text>
            <Text style={styles.indent}>6. 통계: 개인 러닝 통계 및 히트맵</Text>
            <Text style={styles.indent}>7. Apple Watch 연동: 실시간 심박수 표시 및 워크아웃 기록</Text>
            <Text style={styles.bullet}>② 회사는 운영상·기술상의 필요에 따라 서비스의 전부 또는 일부를 변경할 수 있습니다.</Text>
            <Text style={styles.bullet}>③ 서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 합니다. 단, 시스템 점검, 긴급 장애 등의 사유로 일시적으로 중단될 수 있습니다.</Text>

            {/* 제6조 */}
            <Text style={styles.sectionTitle}>제6조 (이용자의 의무)</Text>
            <Text style={styles.paragraph}>
              이용자는 다음 행위를 하여서는 안 됩니다.
            </Text>
            <Text style={styles.indent}>1. GPS 조작, 위치 스푸핑 등을 통한 러닝 기록 위조</Text>
            <Text style={styles.indent}>2. 자동화 도구, 봇, 스크립트 등을 이용한 비정상적 서비스 이용</Text>
            <Text style={styles.indent}>3. 타인의 계정을 도용하거나 무단으로 사용하는 행위</Text>
            <Text style={styles.indent}>4. 서비스 시스템에 대한 해킹, 데이터 크롤링, 리버스 엔지니어링</Text>
            <Text style={styles.indent}>5. 다른 이용자에 대한 욕설, 비방, 성희롱, 차별적 표현</Text>
            <Text style={styles.indent}>6. 타인의 개인정보를 수집, 저장, 공개하는 행위</Text>
            <Text style={styles.indent}>7. 허위 코스 리뷰 작성 또는 랭킹 조작 목적의 행위</Text>
            <Text style={styles.indent}>8. 음란, 폭력적, 불법적 콘텐츠를 게시하는 행위</Text>
            <Text style={styles.indent}>9. 상업적 광고, 스팸을 게시하는 행위</Text>
            <Text style={styles.indent}>10. 기타 관련 법령에 위반되는 행위</Text>

            {/* 제7조 */}
            <Text style={styles.sectionTitle}>제7조 (랭킹 및 공정성)</Text>
            <Text style={styles.bullet}>① 코스 랭킹은 이용자의 러닝 기록(완주 시간, 페이스 등)을 기준으로 자동 산정됩니다.</Text>
            <Text style={styles.bullet}>② 회사는 랭킹의 공정성을 위해 원시 GPS 데이터를 검증하며, 부정행위가 의심되는 기록은 경고 없이 삭제하거나 랭킹에서 제외할 수 있습니다.</Text>
            <Text style={styles.bullet}>③ GPS 조작, 위치 스푸핑, 차량 이용 등 부정한 방법으로 기록을 등록한 경우 해당 기록의 삭제, 계정 일시 정지, 영구 이용 제한 등의 조치를 취할 수 있습니다.</Text>
            <Text style={styles.bullet}>④ 이용자는 부정행위로 의심되는 기록을 회사에 신고할 수 있으며, 회사는 이를 검토 후 적절한 조치를 취합니다.</Text>

            {/* 제8조 */}
            <Text style={styles.sectionTitle}>제8조 (코스 콘텐츠의 권리)</Text>
            <Text style={styles.bullet}>① 이용자가 제작한 코스의 경로 데이터에 대한 저작권은 해당 이용자에게 귀속됩니다.</Text>
            <Text style={styles.bullet}>② 이용자는 코스를 공개함으로써 다른 이용자가 해당 코스를 이용(러닝, 리뷰 작성, 랭킹 참여)하는 것에 동의한 것으로 간주합니다.</Text>
            <Text style={styles.bullet}>③ 회사는 서비스 제공, 홍보, 서비스 개선 목적으로 이용자의 공개 코스 정보를 사용할 수 있습니다.</Text>
            <Text style={styles.bullet}>④ 이용자는 자신이 제작한 코스를 언제든지 비공개로 전환하거나 삭제할 수 있습니다.</Text>

            {/* 제9조 */}
            <Text style={styles.sectionTitle}>제9조 (위치 기반 서비스)</Text>
            <Text style={styles.bullet}>① 서비스는 위치 정보를 활용하여 러닝 트래킹, 코스 탐색 등의 기능을 제공합니다.</Text>
            <Text style={styles.bullet}>② 위치 정보 수집은 이용자가 러닝을 시작할 때 활성화되며, 러닝을 종료하면 수집이 중단됩니다.</Text>
            <Text style={styles.bullet}>③ 이용자는 기기 설정에서 언제든지 위치 정보 수집 권한을 변경할 수 있습니다. 단, 위치 권한을 거부할 경우 러닝 트래킹 기능을 이용할 수 없습니다.</Text>

            {/* 제10조 */}
            <Text style={styles.sectionTitle}>제10조 (Apple Health 연동)</Text>
            <Text style={styles.bullet}>① 이용자는 Apple Watch를 통해 심박수 등 건강 데이터를 서비스에서 확인할 수 있습니다.</Text>
            <Text style={styles.bullet}>② Apple Health 데이터는 이용자의 명시적 동의 하에서만 접근하며, 이용자는 iOS 설정에서 언제든지 접근 권한을 철회할 수 있습니다.</Text>
            <Text style={styles.bullet}>③ Apple Health 데이터는 이용자의 러닝 기록 표시 목적으로만 사용되며, 광고 또는 제3자 제공 목적으로 사용되지 않습니다.</Text>

            {/* 제11조 */}
            <Text style={styles.sectionTitle}>제11조 (이용 제한 및 계정 정지)</Text>
            <Text style={styles.bullet}>① 회사는 이용자가 제6조의 의무를 위반한 경우, 서비스 이용을 제한하거나 계정을 정지할 수 있습니다.</Text>
            <Text style={styles.bullet}>② 이용 제한 조치의 단계는 다음과 같습니다.</Text>
            <Text style={styles.indent}>1. 1차 위반: 경고 및 해당 콘텐츠 삭제</Text>
            <Text style={styles.indent}>2. 2차 위반: 7일간 서비스 이용 제한</Text>
            <Text style={styles.indent}>3. 3차 위반: 30일간 서비스 이용 제한</Text>
            <Text style={styles.indent}>4. 반복 또는 중대 위반: 영구 이용 제한</Text>
            <Text style={styles.bullet}>③ 이용 제한에 이의가 있는 이용자는 회사에 이의를 신청할 수 있으며, 회사는 7일 이내에 검토 결과를 통보합니다.</Text>

            {/* 제12조 */}
            <Text style={styles.sectionTitle}>제12조 (이용 계약의 해지)</Text>
            <Text style={styles.bullet}>① 이용자는 언제든지 앱 내 설정에서 회원 탈퇴를 요청하여 이용 계약을 해지할 수 있습니다.</Text>
            <Text style={styles.bullet}>② 회원 탈퇴 시 다음 정보가 삭제됩니다.</Text>
            <Text style={styles.indent}>1. 프로필 정보 (닉네임, 프로필 사진, 개인 정보)</Text>
            <Text style={styles.indent}>2. 모든 러닝 기록 및 GPS 데이터</Text>
            <Text style={styles.indent}>3. 제작한 코스 및 리뷰</Text>
            <Text style={styles.indent}>4. 랭킹 기록</Text>
            <Text style={styles.bullet}>③ 삭제된 데이터는 복구할 수 없으며, 이용자는 탈퇴 전 필요한 데이터를 별도로 저장해야 합니다.</Text>

            {/* 제13조 */}
            <Text style={styles.sectionTitle}>제13조 (면책 조항)</Text>
            <Text style={styles.bullet}>① 회사는 천재지변, 전쟁, 기간통신사업자의 서비스 중지 등 불가항력적인 사유로 서비스를 제공할 수 없는 경우에는 책임이 면제됩니다.</Text>
            <Text style={styles.bullet}>② 회사는 이용자의 귀책 사유로 인한 서비스 이용 장애에 대하여 책임을 지지 않습니다.</Text>
            <Text style={styles.bullet}>③ GPS 정확도는 기기 성능, 주변 환경(건물, 터널, 날씨 등)에 따라 차이가 발생할 수 있으며, 회사는 GPS 오차로 인한 기록의 부정확성에 대해 보증하지 않습니다.</Text>
            <Text style={styles.bullet}>④ 이용자가 서비스를 이용하면서 발생하는 안전 사고(교통사고, 부상 등)에 대해 회사는 책임을 지지 않습니다. 이용자는 러닝 시 주변 환경을 주의하고 안전에 유의해야 합니다.</Text>
            <Text style={styles.bullet}>⑤ 이용자 간 분쟁에 대하여 회사는 개입할 의무가 없으며, 이로 인한 손해에 대해 책임을 지지 않습니다.</Text>

            {/* 제14조 */}
            <Text style={styles.sectionTitle}>제14조 (손해 배상)</Text>
            <Text style={styles.bullet}>① 회사가 고의 또는 중대한 과실로 이용자에게 손해를 입힌 경우 그 손해를 배상합니다.</Text>
            <Text style={styles.bullet}>② 이용자가 이 약관을 위반하여 회사에 손해를 입힌 경우, 이용자는 그 손해를 배상해야 합니다.</Text>

            {/* 제15조 */}
            <Text style={styles.sectionTitle}>제15조 (분쟁 해결)</Text>
            <Text style={styles.bullet}>① 이 약관과 관련하여 분쟁이 발생한 경우, 회사와 이용자는 원만한 해결을 위해 성실히 협의합니다.</Text>
            <Text style={styles.bullet}>② 협의가 이루어지지 않을 경우, 대한민국 법률에 따르며 관할 법원은 서울중앙지방법원으로 합니다.</Text>

            {/* 제16조 */}
            <Text style={styles.sectionTitle}>제16조 (준거법)</Text>
            <Text style={styles.paragraph}>
              이 약관의 해석 및 적용에 관하여는 대한민국 법률을 적용합니다.
            </Text>

            {/* 부칙 */}
            <Text style={styles.sectionTitle}>부칙</Text>
            <Text style={styles.paragraph}>
              이 약관은 {EFFECTIVE_DATE}부터 시행합니다.
            </Text>

            {/* 문의 */}
            <Text style={styles.sectionTitle}>문의</Text>
            <Text style={styles.paragraph}>
              서비스 이용에 관한 문의 사항은 아래 이메일로 연락해주시기 바랍니다.
            </Text>
            <Text style={styles.bullet}>• 이메일: {COMPANY_EMAIL}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </BlurredBackground>
  );
}

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: SPACING.xxl,
      paddingBottom: SPACING.xxxl + SPACING.xl,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: c.border,
      padding: SPACING.xl,
      gap: SPACING.xs,
    },
    effectiveDate: {
      fontSize: FONT_SIZES.sm,
      color: c.textTertiary,
      fontWeight: '500',
      marginBottom: SPACING.sm,
    },
    sectionTitle: {
      fontSize: FONT_SIZES.md,
      fontWeight: '700',
      color: c.text,
      marginTop: SPACING.lg,
      marginBottom: SPACING.xs,
    },
    paragraph: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      lineHeight: 22,
      marginBottom: SPACING.xs,
    },
    bullet: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      lineHeight: 22,
      paddingLeft: SPACING.sm,
    },
    indent: {
      fontSize: FONT_SIZES.sm,
      color: c.textSecondary,
      lineHeight: 22,
      paddingLeft: SPACING.xl,
    },
  });
