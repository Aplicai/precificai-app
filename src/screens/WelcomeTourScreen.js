import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { determineInitialRoute } from '../utils/initialRoute';

/**
 * WelcomeTourScreen — Tour interativo de 4 slides (audit P1-07).
 *
 * Mostrado APENAS para usuários novos antes de qualquer setup.
 * Persiste a escolha em AsyncStorage chave `welcome_tour_done`.
 *
 * Slides:
 *  1. Boas-vindas + value proposition
 *  2. Como funciona (DAG: Insumos → Preparos → Embalagens → Produtos)
 *  3. Preço sugerido + markup automático
 *  4. Acompanhe sua margem (relatórios + BCG)
 *
 * Após o último slide, marca `welcome_tour_done = true` e segue para
 * o fluxo de setup (ProfileSetup ou Onboarding).
 */

const SLIDES = [
  {
    key: 'welcome',
    icon: 'logo',
    title: 'Bem-vindo ao Precificaí',
    subtitle: 'Precifique com confiança',
    body: 'A ferramenta completa para calcular o preço de venda dos seus produtos com base em custos reais, taxas e a margem de lucro que você quer.',
    accent: colors.primary,
  },
  {
    key: 'flow',
    icon: 'layers',
    title: 'Como funciona',
    subtitle: 'Do insumo ao produto final',
    body: 'Cadastre seus Insumos, monte Preparos (receitas), defina Embalagens e combine tudo nos Produtos. Cada custo aparece automaticamente no produto final.',
    accent: colors.accent,
    steps: ['Insumos', 'Preparos', 'Embalagens', 'Produtos'],
  },
  {
    key: 'price',
    icon: 'tag',
    title: 'Preço sugerido em segundos',
    subtitle: 'Markup automático',
    body: 'Informe sua margem desejada e o app calcula o preço de venda ideal — já considerando custos fixos, taxas de cartão e plataformas de delivery.',
    accent: colors.primarySoft,
  },
  {
    key: 'margin',
    icon: 'trending-up',
    title: 'Acompanhe sua margem',
    subtitle: 'Decisões com base em dados',
    body: 'Veja relatórios de margem, identifique produtos com baixo lucro e use a Matriz BCG para classificar o que vale mais a pena vender.',
    accent: colors.yellow,
  },
];

export default function WelcomeTourScreen({ navigation }) {
  const { width } = useWindowDimensions();
  const isWebDesktop = Platform.OS === 'web' && width >= 1024;
  // Limita a largura da "área de slide" no desktop para não esticar feio
  const slideWidth = isWebDesktop ? Math.min(560, width) : width;
  const scrollRef = useRef(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(
    (e) => {
      const offset = e.nativeEvent.contentOffset.x;
      const i = Math.round(offset / slideWidth);
      if (i !== index && i >= 0 && i < SLIDES.length) setIndex(i);
    },
    [index, slideWidth],
  );

  const goToSlide = useCallback(
    (i) => {
      scrollRef.current?.scrollTo({ x: i * slideWidth, animated: true });
      setIndex(i);
    },
    [slideWidth],
  );

  const finish = useCallback(async () => {
    try {
      await AsyncStorage.setItem('welcome_tour_done', 'true');
    } catch {}
    // Determina a próxima rota (pulando o próprio tour) e navega
    let next = 'ProfileSetup';
    try {
      next = await determineInitialRoute({ skipWelcomeTour: true });
    } catch {
      next = 'ProfileSetup';
    }
    if (navigation.replace) {
      navigation.replace(next);
    } else {
      navigation.navigate(next);
    }
  }, [navigation]);

  const onNext = useCallback(() => {
    if (index < SLIDES.length - 1) {
      goToSlide(index + 1);
    } else {
      finish();
    }
  }, [index, goToSlide, finish]);

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Skip button — top right */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }} />
        {!isLast && (
          <Pressable
            onPress={finish}
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Pular tour"
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>Pular</Text>
          </Pressable>
        )}
      </View>

      {/* Carousel */}
      <View style={[styles.carouselWrap, isWebDesktop && { alignItems: 'center' }]}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScroll}
          onScroll={Platform.OS === 'web' ? onScroll : undefined}
          scrollEventThrottle={16}
          style={{ width: slideWidth }}
          contentContainerStyle={{ alignItems: 'stretch' }}
        >
          {SLIDES.map((s) => (
            <Slide key={s.key} slide={s} width={slideWidth} />
          ))}
        </ScrollView>
      </View>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => goToSlide(i)}
            hitSlop={10}
            accessibilityLabel={`Ir para passo ${i + 1}`}
            accessibilityRole="button"
          >
            <View
              style={[
                styles.dot,
                i === index && styles.dotActive,
              ]}
            />
          </Pressable>
        ))}
      </View>

      {/* CTA */}
      <View style={[styles.ctaWrap, isWebDesktop && { maxWidth: 560, alignSelf: 'center', width: '100%' }]}>
        <Pressable
          onPress={onNext}
          style={({ pressed }) => [
            styles.ctaBtn,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel={isLast ? 'Começar' : 'Próximo'}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{isLast ? 'Começar' : 'Próximo'}</Text>
          <Feather
            name={isLast ? 'check' : 'arrow-right'}
            size={20}
            color={colors.textLight}
            style={{ marginLeft: 8 }}
          />
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Slide({ slide, width }) {
  return (
    <View style={[slideStyles.container, { width }]}>
      <View style={[slideStyles.iconWrap, { backgroundColor: `${slide.accent}15` }]}>
        {slide.icon === 'logo' ? (
          <Image
            source={require('../../assets/images/logo-icon-green.png')}
            style={slideStyles.logo}
            resizeMode="contain"
          />
        ) : (
          <Feather name={slide.icon} size={64} color={slide.accent} />
        )}
      </View>

      <Text style={slideStyles.title}>{slide.title}</Text>
      <Text style={[slideStyles.subtitle, { color: slide.accent }]}>{slide.subtitle}</Text>
      <Text style={slideStyles.body}>{slide.body}</Text>

      {slide.steps && (
        <View style={slideStyles.stepsRow}>
          {slide.steps.map((step, i) => (
            <React.Fragment key={step}>
              <View style={[slideStyles.stepPill, { borderColor: slide.accent }]}>
                <Text style={[slideStyles.stepText, { color: slide.accent }]}>{step}</Text>
              </View>
              {i < slide.steps.length - 1 && (
                <Feather name="chevron-right" size={16} color={colors.textSecondary} />
              )}
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    minHeight: 48,
  },
  skipBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  skipText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  carouselWrap: {
    flex: 1,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.primary,
  },
  ctaWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
  },
  ctaBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    color: colors.textLight,
    fontSize: fonts.medium,
    fontFamily: fontFamily.semiBold,
  },
});

const slideStyles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  logo: {
    width: 92,
    height: 92,
  },
  title: {
    fontSize: fonts.header,
    fontFamily: fontFamily.bold,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fonts.medium,
    fontFamily: fontFamily.semiBold,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 440,
  },
  stepsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: spacing.lg,
    gap: 6,
  },
  stepPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    borderWidth: 1.5,
  },
  stepText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
  },
});
