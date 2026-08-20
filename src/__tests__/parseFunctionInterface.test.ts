import { parseFunctionInterface } from '../handlers/JsonRemoteFunctionCallHandlers';

/**
 * The generated `*"` block is the only place ADT exposes a function module's
 * signature, so these cases pin the shapes SAP actually emits. They are pure
 * string parsing — no SAP system involved.
 */
describe('parseFunctionInterface', () => {
    it('reads a single EXPORTING parameter typed with LIKE ... STRUCTURE', () => {
        // RFC_SYSTEM_INFO, the canonical zero-input probe.
        const source = [
            'FUNCTION RFC_SYSTEM_INFO.',
            '*"----------------------------------------------------------------------',
            '*"*"Lokale Schnittstelle:',
            '*"  EXPORTING',
            '*"     VALUE(RFCSI_EXPORT) LIKE  RFCSI STRUCTURE  RFCSI',
            '*"----------------------------------------------------------------------',
            '  rfcsi_export = rfcsi.',
            'ENDFUNCTION.'
        ].join('\n');

        const { parameters, exceptions } = parseFunctionInterface(source);

        expect(exceptions).toEqual([]);
        expect(parameters).toEqual([{
            name: 'RFCSI_EXPORT',
            kind: 'EXPORTING',
            passing: 'VALUE',
            typing: 'LIKE',
            type: 'RFCSI',
            optional: false,
            defaultValue: undefined
        }]);
    });

    it('reads all five sections, defaults, namespaced names and TABLES', () => {
        const source = [
            'FUNCTION /ACME/Z_FULL_HOUSE.',
            '*"----------------------------------------------------------------------',
            '*"*"Local Interface:',
            '*"  IMPORTING',
            '*"     VALUE(IV_MATNR) TYPE  MATNR',
            '*"     REFERENCE(IV_LANGU) TYPE  SPRAS DEFAULT SY-LANGU',
            '*"     REFERENCE(IV_FLAG) TYPE  CHAR1 DEFAULT \'X\' OPTIONAL',
            '*"     VALUE(/ACME/IV_NS) TYPE  CHAR10 OPTIONAL',
            '*"  EXPORTING',
            '*"     VALUE(EV_TEXT) TYPE  STRING',
            '*"  CHANGING',
            '*"     REFERENCE(CV_COUNT) TYPE  I',
            '*"  TABLES',
            '*"      IT_ITEMS STRUCTURE  MARA OPTIONAL',
            '*"      IT_TYPED TYPE  MARA_TT',
            '*"  EXCEPTIONS',
            '*"      NOT_FOUND',
            '*"      FAILED',
            '*"----------------------------------------------------------------------',
            '  " a stray *" comment further down must not be parsed',
            '*"  IMPORTING',
            '*"     VALUE(IV_NEVER) TYPE  STRING',
            'ENDFUNCTION.'
        ].join('\n');

        const { parameters, exceptions } = parseFunctionInterface(source);

        expect(parameters.map(p => p.name)).toEqual([
            'IV_MATNR', 'IV_LANGU', 'IV_FLAG', '/ACME/IV_NS',
            'EV_TEXT', 'CV_COUNT', 'IT_ITEMS', 'IT_TYPED'
        ]);
        expect(exceptions).toEqual(['NOT_FOUND', 'FAILED']);

        // The stray block after the closing ruler is not picked up.
        expect(parameters.some(p => p.name === 'IV_NEVER')).toBe(false);

        const byName = Object.fromEntries(parameters.map(p => [p.name, p]));
        expect(byName['IV_MATNR']).toMatchObject({ kind: 'IMPORTING', passing: 'VALUE', optional: false });
        // A DEFAULT makes a parameter optional even without the OPTIONAL keyword.
        expect(byName['IV_LANGU']).toMatchObject({ optional: true, defaultValue: 'SY-LANGU' });
        expect(byName['IV_FLAG']).toMatchObject({ optional: true, defaultValue: "'X'" });
        expect(byName['/ACME/IV_NS']).toMatchObject({ optional: true, defaultValue: undefined });
        expect(byName['CV_COUNT']).toMatchObject({ kind: 'CHANGING', typing: 'TYPE', type: 'I' });
        // TABLES parameters carry no VALUE/REFERENCE wrapper.
        expect(byName['IT_ITEMS']).toMatchObject({
            kind: 'TABLES', passing: undefined, typing: 'STRUCTURE', type: 'MARA', optional: true
        });
        expect(byName['IT_TYPED']).toMatchObject({ kind: 'TABLES', typing: 'TYPE', type: 'MARA_TT' });
    });

    it('returns nothing for a function module without parameters', () => {
        const source = [
            'FUNCTION Z_EMPTY.',
            '*"----------------------------------------------------------------------',
            '*"*"Local Interface:',
            '*"----------------------------------------------------------------------',
            'ENDFUNCTION.'
        ].join('\n');

        expect(parseFunctionInterface(source)).toEqual({ parameters: [], exceptions: [] });
    });

    it('treats class based RAISING as exceptions', () => {
        const source = [
            'FUNCTION Z_CLASS_BASED.',
            '*"----------------------------------------------------------------------',
            '*"*"Local Interface:',
            '*"  IMPORTING',
            '*"     VALUE(IV_IN) TYPE  STRING',
            '*"  RAISING',
            '*"      CX_SY_CONVERSION_ERROR',
            '*"----------------------------------------------------------------------',
            'ENDFUNCTION.'
        ].join('\n');

        const { parameters, exceptions } = parseFunctionInterface(source);

        expect(parameters.map(p => p.name)).toEqual(['IV_IN']);
        expect(exceptions).toEqual(['CX_SY_CONVERSION_ERROR']);
    });

    it('ignores a source with no interface block at all', () => {
        expect(parseFunctionInterface('FUNCTION Z_NO_BLOCK.\nENDFUNCTION.'))
            .toEqual({ parameters: [], exceptions: [] });
    });
});
