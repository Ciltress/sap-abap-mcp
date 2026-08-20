# Units of measurement

One topic from the *Released ABAP Classes* cheat sheet; the rest are listed in this skill's SKILL.md.
A class appearing here is not proof it exists on your system - release state is per system and per
release. `readAbapObject` returning the object is the proof.

## Contents

- Units of Measurement

---

## Units of Measurement

<table>
<tr>
<td> Class </td> <td> Details/Code Snippet </td>
</tr>
<tr>
<td> <code>CL_UOM_DIM_MAINTENANCE</code> </td>
<td>

- Handling dimensions
- Find more information [here](https://help.sap.com/docs/ABAP_ENVIRONMENT/250515df61b74848810389e964f8c367/8961c2c4cebf457f95fb080a736babdc.html?locale=en-US) and in the class documentation.
- The example code snippet includes reading dimensions. See the link above for the methods to create, change and delete dimensions.
 
<br><br>

```abap
CLASS zcl_demo_abap DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    INTERFACES if_oo_adt_classrun.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS zcl_demo_abap IMPLEMENTATION.
  METHOD if_oo_adt_classrun~main.

    DATA(dimension_inst) = cl_uom_dim_maintenance=>get_instance( ).

    TRY.
        dimension_inst->read( EXPORTING  dimid  = 'TEMP'
                              IMPORTING  dim_st = DATA(dimension_details) ).

        DATA(id) = dimension_details-dimid.
        DATA(text) = dimension_details-txdim.

        out->write( data = id name = `id` ).
        out->write( data = text name = `text` ).
      CATCH cx_uom_error INTO DATA(read_error).
        out->write( read_error->get_text( ) ).
    ENDTRY.

    out->write( repeat( val = `-` occ = 50 ) ).

**********************************************************************

    "Reading dimensions based on entries in the released view I_UnitOfMeasureDimension
    "Various components and values from the returned structure are output for demonstration purposes.

    SELECT UnitOfMeasureDimension FROM I_UnitOfMeasureDimension INTO TABLE @DATA(dimensions) UP TO 10 ROWS.

    LOOP AT dimensions INTO DATA(wa).

      DATA(dim_inst) = cl_uom_dim_maintenance=>get_instance( ).
      TYPES c6 TYPE c LENGTH 6.
      TRY.
          dim_inst->read( EXPORTING  dimid  = CONV c6( wa )
                          IMPORTING  dim_st = DATA(dim_details) ).

          LOOP AT CAST cl_abap_structdescr( cl_abap_typedescr=>describe_by_data( dim_details ) )->components INTO DATA(co).
            "Applying string conversion to name and values for output purposes
            "Note that many of the components have numeric types.
            DATA(comp) = CONV string( co-name ).
            DATA(value) = CONV string( dim_details-(comp) ).

            "Outputting only those entries that do not have an initial value
            IF value IS NOT INITIAL AND value NP `0*`.
              out->write( data = value name = comp ).
            ENDIF.
          ENDLOOP.
        CATCH cx_uom_error INTO DATA(read_err).
          out->write( read_err->get_text( ) ).
      ENDTRY.
      out->write( repeat( val = `-` occ = 20 ) ).
    ENDLOOP.

  ENDMETHOD.

ENDCLASS.
``` 

</td>
</tr>
<tr>
<td> <code>CL_UOM_MAINTENANCE</code> </td>
<td>

- Handling units of measurement
- Find more information [here](https://help.sap.com/docs/ABAP_ENVIRONMENT/250515df61b74848810389e964f8c367/238be94930874ed9ba3a3dc6469e99b3.html?locale=en-US) and in the class documentation.
- The example code snippet includes reading units of measurement. See the link above for the methods to create, change and delete dimensions.

<br><br>

```abap
DATA(unit_mea_inst) = cl_uom_maintenance=>get_instance( ).
TRY.
 unit_mea_inst->read( EXPORTING unit = 'S'
                      IMPORTING unit_st = DATA(unit_mea) ).

 DATA(unit) = unit_mea-unit.
 DATA(comm) = unit_mea-commercial.
 DATA(tech) = unit_mea-technical.
 DATA(iso) = unit_mea-isocode.
 DATA(id) = unit_mea-dimid.
 DATA(text) = unit_mea-long_text.

 CATCH cx_uom_error INTO DATA(unit_read_error).
  DATA(error_msg) = unit_read_error->get_text( ).
ENDTRY.

"Note: Released view for units of measurement: I_UNITOFMEASURE.
``` 

</td>
</tr>

<tr>
<td> <code>CL_UOM_CONVERSION</code> </td>
<td>

- Converting units of measurement
- Find more information [here](https://help.sap.com/docs/ABAP_ENVIRONMENT/250515df61b74848810389e964f8c367/73109c66f397494abfa2bf3608740c12.html?locale=en-US) and in the class documentation.
- The example code snippet explores unit of measurement conversion. See the link above for more methods available.

<br><br>

```abap
DATA output TYPE decfloat34.

DATA(conv_unit_inst) = cl_uom_conversion=>create( ).

conv_unit_inst->unit_conversion_simple( EXPORTING  input                = CONV decfloat34( '1' )
                                                   round_sign           = 'X'
                                                   unit_in              = 'KG'
                                                   unit_out             = 'G'
                                        IMPORTING  output               = output
                                        EXCEPTIONS conversion_not_found = 01
                                                   division_by_zero     = 02
                                                   input_invalid        = 03
                                                   output_invalid       = 04
                                                   overflow             = 05
                                                   units_missing        = 06
                                                   unit_in_not_found    = 07
                                                   unit_out_not_found   = 08 ).

IF sy-subrc = 0.
 "1000.000
 DATA(outp) = output.
ELSE.
 DATA(subrc) = sy-subrc.
ENDIF.

TYPES: BEGIN OF s,
         input      TYPE decfloat34,
         round_sign TYPE c LENGTH 1,
         unit_in    TYPE cl_uom_conversion=>ty_msehi,
         unit_out   TYPE cl_uom_conversion=>ty_msehi,        
       END OF s,
       tab_type TYPE TABLE OF s WITH EMPTY KEY.

DATA(tab4conv) = VALUE tab_type( ( input = '1.9876543210'
                                   round_sign = '+'  "rounding up
                                   unit_in = 'KG'
                                   unit_out = 'G' )
                                 ( input = '1.9876543210'
                                   round_sign = '-' "rounding down
                                   unit_in = 'KG'
                                   unit_out = 'G' )
                                 ( input = '1987.6543210'
                                   round_sign = ' ' "no rounding
                                   unit_in = 'G'
                                   unit_out = 'KG' )
                                 ( input = '60'
                                   round_sign = 'X' "commercial
                                   unit_in = 'MIN'
                                   unit_out = 'H' )
                                 ( input = '1'
                                   round_sign = 'X'
                                   unit_in = 'TAG'
                                   unit_out = 'H' )
                                 ( input = '1'
                                   round_sign = 'X'
                                   unit_in = 'JHR'
                                   unit_out = 'TAG' )
                                 ( input = '123456'
                                   round_sign = 'X'
                                   unit_in = 'ABC'
                                   unit_out = 'H' ) ).

LOOP AT tab4conv INTO DATA(conversion).
    DATA(conv_inst) = cl_uom_conversion=>create( ).

    conv_inst->unit_conversion_simple( EXPORTING input                  = conversion-input
                                                 round_sign             = conversion-round_sign
                                                 unit_in                = conversion-unit_in
                                                 unit_out               = conversion-unit_out
                                        IMPORTING  output               = output
                                        EXCEPTIONS conversion_not_found = 01
                                                   division_by_zero     = 02
                                                   input_invalid        = 03
                                                   output_invalid       = 04
                                                   overflow             = 05
                                                   units_missing        = 06
                                                   unit_in_not_found    = 07
                                                   unit_out_not_found   = 08 ).

    IF sy-subrc = 0.
     outp = output.
    ELSE.
     subrc = sy-subrc.
    ENDIF.
ENDLOOP.

*Results:
*1987.655
*1987.654
*1.98765
*1.0
*24.0
*365.0
*7 (error, sy-subrc value)

"Retrieving mass- and time-related units of measurement using
"a released API
SELECT *
 FROM i_unitofmeasure
 WHERE unitofmeasuredimension = `TIME` OR unitofmeasuredimension = `MASS`
 INTO TABLE @DATA(umea).
``` 

</td>
</tr>

</table>

<p align="right"><a href="#top">⬆️ back to top</a></p>
