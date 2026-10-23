import unittest
from decimal import Decimal
from equipment_effects import build_baselines, extra_effects


def row(code, grade, fx, level=50, expert=0):
    result = dict(Code=code, ItemGrade=grade, Grade=grade, IsExist=1, LevelLim=level,
                  Civil='00001', ExpertID1=expert, ExpertID2=255, EffNum=len(fx))
    for index, (effect, value) in enumerate(fx, 1):
        result[f'Eff{index}Code'], result[f'Eff{index}Unit'] = effect, value
    return result


class ExtraEffectsTest(unittest.TestCase):
    def test_melee_merged_accuracy_preserves_only_the_increment(self):
        refs = [row('ihawa50', 0, [(3, 5)]), row('ihawb50', 1, [(3, 5)])]
        base = build_baselines('HELMET', refs)
        self.assertEqual(extra_effects('HELMET', refs[1], base)[0], {})
        # O código conserva nível nominal 50; a exigência Type C passou a 49.
        self.assertEqual(extra_effects('HELMET', row('ihdwr50', 3, [(3, 9)], 49), base)[0], {3: Decimal(4)})

    def test_force_removes_all_intrinsics_and_splits_a_shared_code(self):
        fx = [(15, .06), (16, .03), (26, 12)]
        refs = [row('ihafa50', 0, fx, expert=3), row('ihafb50', 1, fx, expert=3)]
        model = row('ihafs50', 3, [(15, .1), (16, .03), (26, 12)], expert=3)
        self.assertEqual(extra_effects('HELMET', model, build_baselines('HELMET', refs))[0], {15: Decimal('.04')})

    def test_range_speed_is_removed_but_elemental_extra_remains(self):
        refs = [row('ihara50', 0, [(12, .2)], expert=1), row('iharb50', 1, [(12, .2)], expert=1)]
        model = row('iharz50', 3, [(12, .2), (29, 4)], expert=1)
        self.assertEqual(extra_effects('HELMET', model, build_baselines('HELMET', refs))[0], {29: Decimal(4)})

    def test_conflicting_or_absent_base_does_not_erase_an_effect(self):
        refs = [row('ihawa50', 0, [(3, 5)]), row('ihawb50', 1, [(3, 6)])]
        model = row('ihawr50', 3, [(3, 9)])
        values, note = extra_effects('HELMET', model, build_baselines('HELMET', refs))
        self.assertEqual(values, {3: Decimal(9)})
        self.assertIn('não confirmado', note)

    def test_superior_family_uses_its_own_grade_one_reference(self):
        reference = row('igawb51', 1, [(3, 5), (6, .08)], level=50)
        model = row('igawr51', 3, [(3, 9), (6, .08)], level=44)
        self.assertEqual(extra_effects('GLOVES', model, build_baselines('GLOVES', [reference]))[0], {3: Decimal(4)})

    def test_striker_base_is_distinct_from_force_and_other_classes(self):
        reference = row('ihalb50', 1, [(3, 5), (25, -1000)], expert=2)
        model = row('ihalr50', 3, [(3, 9), (25, -1000)], expert=2)
        self.assertEqual(extra_effects('HELMET', model, build_baselines('HELMET', [reference]))[0], {3: Decimal(4)})

    def test_intense_weapon_without_base_effect_keeps_type_c_bonus(self):
        refs = [row('iwsta50', 0, []), row('iwstb50', 1, [])]
        self.assertEqual(extra_effects('WEAPON', row('iwtjb50', 3, [(29, 4)]), build_baselines('WEAPON', refs))[0], {29: Decimal(4)})


if __name__ == '__main__':
    unittest.main()
